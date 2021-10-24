/* Matches:
 * 1: Full type
 * 2: Type const
 * 3: Type
 * 4: Type pointer
 * 5: Pointer-to-pointer const
 * 6: pointer-to-pointer
 * 7: Name
 */
const ProtoRegex = /^((const)?\s*(\w+)\s*(\*)?\s*(?:(const)?\s*(\*))?)\s*(\w+)$/;

function parseProto(proto) {
    const match = proto.match(ProtoRegex);
    if (match === null) throw new Error(`Unable to parse proto: "${proto}"`);
    const [_, fullType, typeConst, type, typePointer, ptrConst, ptrPtr, name] = match;
    const typeDefinition = {
        isConst: typeConst !== undefined,
        isPointer: typePointer !== undefined,
        type,
    };
    return {
        fullType: fullType.trim(),
        type: typeDefinition,
        isConstPtr: ptrConst !== undefined,
        isPtrToPtr: ptrPtr !== undefined,
    };
}

function jsValueToPointer(name, type, arg, indent) {
    if (type === "void")
        return `${indent}if (${arg}.IsDataView()) {
${indent}    auto dataView{${arg}.As<Napi::DataView>()};
${indent}    ${name} = reinterpret_cast<void*>(reinterpret_cast<uint8_t*>(dataView.ArrayBuffer().Data()) + dataView.ByteOffset());
${indent}} else if (${arg}.IsNumber()) {
${indent}    ${name} = (void*) ${arg}.ToNumber().Int64Value();
${indent}} else {
${indent}    auto arrayBuffer{${arg}.As<Napi::ArrayBuffer>()};
${indent}    ${name} = arrayBuffer.Data();
${indent}}`;
    else
        return `${indent}{
${indent}    auto typedArray{${arg}.As<Napi::TypedArray>()};
${indent}    if (typedArray.ElementSize() != sizeof(${type})) {
${indent}        throw Napi::TypeError::New(info.Env(), "Wrong TypedArray element size.");
${indent}    }
${indent}    uint8_t* arrayBuffer{reinterpret_cast<uint8_t*>(typedArray.ArrayBuffer().Data())};
${indent}    ${name} = reinterpret_cast<${type}*>(arrayBuffer + typedArray.ByteOffset());
${indent}}`;
}

// TODO: Support GLint64, GLuint64
function generateParam(param, argumentIndex) {
    const {name, proto} = param;
    const {type, fullType, isConstPtr, isPtrToPtr} = parseProto(proto);

    let consumed = 0;
    let body = `        // param: arguments[${argumentIndex}] ${proto}\n`;

    if (isPtrToPtr) {
        const vec = `${name}Vec`;
        if (isConstPtr) body += `        std::vector<${type.type}*> ${vec};`;

        body += `        if (info[${argumentIndex}].IsObject()) {
            auto argObj{info[${argumentIndex}].ToObject()};
            if (argObj.InstanceOf(info.Env().GetInstanceData<NooglAddonData>()->cptrCtorRef.Value())) {
                ${name} = CPtr::Unwrap(argObj)->CastPtr<${fullType}>();
            }
        }`

        if (isConstPtr) {
            body += ` else if (info[${argumentIndex}].IsArray()) {
            Napi::Array argArray{info[${argumentIndex}].As<Napi::Array>()};
            auto arrLength{argArray.Length()};
            ${vec}.resize(argArray.Length());
            for(uint32_t i{0}; i < arrLength; ++i) {
${jsValueToPointer(`${vec}[i]`, type.type, `argArray.Get(i)`, "                ")}
            }
        }
        ${name} = ${vec}.data();`;
        }
        consumed++;
    } else if (type.isPointer) {
        body += jsValueToPointer(name, type.type, `info[${argumentIndex}]`, "        ");
        consumed++;
    } else if (["GLint", "GLuint", "GLsizei", "GLenum", "GLfloat", "GLclampf", "GLdouble", "GLclampd", "GLbitfield", "GLintptr", "GLsizeiptr"].includes(type.type)) {
        body += `        ${name} = info[${argumentIndex}].ToNumber();`
        consumed++;
    } else if (["GLbyte", "GLshort"].includes(type.type)) {
        body += `        ${name} = (${type.type}) info[${argumentIndex}].ToNumber().Int32Value();`
        consumed++;
    } else if (["GLubyte", "GLushort"].includes(type.type)) {
        body += `        ${name} = (${type.type}) info[${argumentIndex}].ToNumber().Uint32Value();`
        consumed++;
    } else if (type.type === "GLboolean") {
        body += `        ${name} = (${type.type}) info[${argumentIndex}].ToBoolean() == true ? 1 : 0;`
        consumed++;
    } else if (type.type === "GLsync") {
        body += `        ${name} = info[${argumentIndex}].As<Napi::External<std::remove_pointer<GLsync>::type>>().Data();`
    } else {
        throw new Error(`Unsupported parameter type: ${fullType}`);
    }
    return [consumed, body];
}

function generateInvocation(pointerName, proto, params) {
    //const {type: resultType, fullType: fullReturnType, pointer: returnPointer} = parseProto(proto);

    const {type, fullType} = parseProto(proto);

    const invoke = `${pointerName}(${params.map(it => it.name).join(", ")})`;

    let returns, returnType;
    if (fullType === "void") {
        returns = `        ${invoke};`;
        returnType = "void";
    } else {
        returnType = "Napi::Value"
        if (type.isPointer) {
            returns = `        auto retPtr{${invoke}};
        auto ptrExt{Napi::External<void>::New(info.Env(), (void*) const_cast<std::remove_const<${fullType}>::type>(retPtr))};
        return info.Env().GetInstanceData<NooglAddonData>()->cptrCtorRef.New({ptrExt});`;
        } else if (["GLint", "GLuint", "GLsizei", "GLulong", "GLenum", "GLfloat", "GLclampf", "GLdouble", "GLclampd", "GLbitfield"].includes(type.type)) {
            returns = `        return Napi::Number::New(info.Env(), ${invoke});`
        } else if (type.type === "GLboolean") {
            // GLboolean is internally unsigned char.
            returns = `        return Napi::Boolean::New(info.Env(), ${invoke} == 1);`;
        } else if (type.type === "GLsync") {
            returns = `        return Napi::External<std::remove_pointer<GLsync>::type>::New(info.Env(), ${invoke});`;
        } else {
            throw new Error(`Unsupported return type: ${fullType}`);
        }
    }
    return [returns, returnType];
}

/**
 * @param {GlCommand} command
 */
function generateCommand(command, clazz, loadFunc) {
    const {name: actualName} = command;

    const typeName = `p${actualName}`
    const pointerName = `m${actualName}`;
    const functionName = `noogl_${actualName}`;

    const functionPointer = `${command.proto.replace(command.name, `(*${typeName})(${command.params.map(it => it.proto).join(", ")})`)}`

    const typeDef =
        `typedef ${functionPointer};`

    const pointerDeclaration =
        `    ${typeName} ${pointerName};`;

    const initDefinition =
        `            InstanceMethod<&${clazz}::${functionName}>("${actualName}")`;

    const loadPointer =
        `        ${pointerName} = (${typeName}) ${loadFunc}("${actualName}");`;

    let argumentIndex = 0;
    const parameters = command.params.map((param, i) => {
        const [consumed, body] = generateParam(param, argumentIndex);
        argumentIndex += consumed;
        return body;
    });


    // TODO: Split into separate function
    const [returns, returnType] = generateInvocation(pointerName, command.proto, command.params);

    const implementation = `    ${returnType} ${functionName}(const Napi::CallbackInfo& info) {
        ${command.params.map(it => `${it.proto};`).join('\n        ')}
        
${parameters.join("\n")}
        
${returns}
    }`

    return {typeDef, pointerDeclaration, initDefinition, loadPointer, implementation};
}

module.exports = generateCommand;
