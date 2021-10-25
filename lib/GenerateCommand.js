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

const typescriptArray = types => types.length === 1 ? `${types[0]}[]` : `(${types.join(" | ")})[]`;


function jsValueToPointer(name, type, arg, indent) {
    return `${indent}if (${arg}.IsObject() && ${arg}.ToObject().InstanceOf(info.Env().GetInstanceData<NooglAddonData>()->cptrCtorRef.Value())) {
${indent}    ${name} = CPtr::Unwrap(${arg}.ToObject())->CastPtr<${type}*>();
${indent}} else if (${arg}.IsArrayBuffer()) {
${indent}    auto arrayBuffer{${arg}.As<Napi::ArrayBuffer>()};
${indent}    ${name} = static_cast<${type}*>(arrayBuffer.Data());
${indent}} else if (${arg}.IsDataView()) {
${indent}    auto dataView{${arg}.As<Napi::DataView>()};
${indent}    ${name} = reinterpret_cast<${type}*>(reinterpret_cast<uint8_t*>(dataView.ArrayBuffer().Data()) + dataView.ByteOffset());
${indent}} else if (${arg}.IsTypedArray()) {
${indent}    auto typedArray{${arg}.As<Napi::TypedArray>()};
${indent}    uint8_t* arrayBuffer{reinterpret_cast<uint8_t*>(typedArray.ArrayBuffer().Data())};
${indent}    ${name} = reinterpret_cast<${type}*>(arrayBuffer + typedArray.ByteOffset());
${indent}}`;
}

const typedArrayLookup = {
    GLchar: "Int8Array",
    GLboolean: "Int8Array",
    GLbyte: "Int8Array",
    GLubyte: "Uint8Array",
    GLshort: "Int16Array",
    GLushort: "Uint16Array",
    GLint: "Int32Array",
    GLsizei: "Int32Array",
    GLuint: "Uint32Array",
    GLenum: "Uint32Array",
    GLint64: "BigInt64Array",
    GLintptr: "BigInt64Array",
    GLsizeiptr: "BigInt64Array",
    GLuint64: "BigUint64Array",
    GLfloat: "Float32Array",
    GLdouble: "Float64Array",
};
const pointerLikeTypes = type => {
    if (type === "void") return ["PointerLike"];

    if (!typedArrayLookup[type]) throw new Error(`No TypedArray for type: ${type}`);
    return ["PointerLike", typedArrayLookup[type]];
};

// TODO: Support GLint64, GLuint64
function generateParam(param, argumentIndex) {
    const {name, proto} = param;
    const {type, fullType, isConstPtr, isPtrToPtr} = parseProto(proto);

    let consumed = 0;
    let body = `        // param: arguments[${argumentIndex}] ${proto}\n`;
    let typescriptTypes = [];

    if (isPtrToPtr) {
        const vec = `${name}Vec`;
        typescriptTypes.push("CPtr");
        if (isConstPtr) {
            typescriptTypes.push(typescriptArray(pointerLikeTypes(type.type)));
            body += `        std::vector<${type.type}*> ${vec};
        `;
        }

        if (isConstPtr) {
            body += `if (info[${argumentIndex}].IsArray()) {
            Napi::Array argArray{info[${argumentIndex}].As<Napi::Array>()};
            auto arrLength{argArray.Length()};
            ${vec}.resize(arrLength);
            for(uint32_t i{0}; i < arrLength; ++i) {
${jsValueToPointer(`${vec}[i]`, type.type, `argArray.Get(i)`, "                ")}
            }
            ${name} = ${vec}.data();
        } else `;
        }

        body += `if (info[${argumentIndex}].IsObject()) {
            auto argObj{info[${argumentIndex}].ToObject()};
            if (argObj.InstanceOf(info.Env().GetInstanceData<NooglAddonData>()->cptrCtorRef.Value())) {
                ${name} = CPtr::Unwrap(argObj)->CastPtr<${fullType}>();
            }
        }`;
        consumed++;
    } else if (type.isPointer) {
        body += jsValueToPointer(name, type.type, `info[${argumentIndex}]`, "        ");
        typescriptTypes.push(...pointerLikeTypes(type.type));
        consumed++;
    } else {
        if (["GLint", "GLuint", "GLsizei", "GLenum", "GLfloat", "GLclampf", "GLdouble", "GLclampd", "GLbitfield", "GLintptr", "GLsizeiptr"].includes(type.type)) {
            body += `        ${name} = info[${argumentIndex}].ToNumber();`;
        } else if (["GLbyte", "GLshort"].includes(type.type)) {
            body += `        ${name} = (${type.type}) info[${argumentIndex}].ToNumber().Int32Value();`;
        } else if (["GLubyte", "GLushort"].includes(type.type)) {
            body += `        ${name} = (${type.type}) info[${argumentIndex}].ToNumber().Uint32Value();`;
        } else if (["GLint64", "GLuint64"].includes(type.type)) {
            body += `        ${name} = (${type.type}) info[${argumentIndex}].ToNumber().Int64Value();`;
        } else if (type.type === "GLboolean") {
            body += `        ${name} = (${type.type}) info[${argumentIndex}].ToBoolean() == true ? 1 : 0;`;
        } else if (type.type === "GLsync") {
            body += `        ${name} = info[${argumentIndex}].As<Napi::External<std::remove_pointer<GLsync>::type>>().Data();`;
        } else {
            throw new Error(`Unsupported parameter type: ${fullType}`);
        }
        typescriptTypes.push(type.type);
        consumed++;
    }

    if (typescriptTypes.length === 0) throw new Error(`Unable to determine Typescript type for: ${fullType}`);

    return {consumed, body, typescriptDefinition: `${name}: ${typescriptTypes.join(" | ")}`};
}

function generateInvocation(pointerName, proto, params) {
    const {type, fullType} = parseProto(proto);

    const invoke = `${pointerName}(${params.map(it => it.name).join(", ")})`;

    let returns, returnType, typescriptReturnType;
    if (fullType === "void") {
        returns = `        ${invoke};`;
        returnType = "void";
        typescriptReturnType = "void";
    } else {
        returnType = "Napi::Value"
        if (type.isPointer) {
            returns = `        auto retPtr{${invoke}};
        auto ptrExt{Napi::External<void>::New(info.Env(), (void*) const_cast<std::remove_const<${fullType}>::type>(retPtr))};
        return info.Env().GetInstanceData<NooglAddonData>()->cptrCtorRef.New({ptrExt});`;
            typescriptReturnType = "CPtr";
        } else if (["GLint", "GLuint", "GLsizei", "GLulong", "GLenum", "GLfloat", "GLclampf", "GLdouble", "GLclampd", "GLbitfield"].includes(type.type)) {
            returns = `        return Napi::Number::New(info.Env(), ${invoke});`
            typescriptReturnType = type.type;
        } else if (type.type === "GLboolean") {
            // GLboolean is internally unsigned char.
            returns = `        return Napi::Boolean::New(info.Env(), ${invoke} == 1);`;
            typescriptReturnType = type.type;
        } else if (type.type === "GLsync") {
            returns = `        return Napi::External<std::remove_pointer<GLsync>::type>::New(info.Env(), ${invoke});`;
            typescriptReturnType = type.type;
        } else {
            throw new Error(`Unsupported return type: ${fullType}`);
        }
    }
    return {returns, returnType, typescriptReturnType};
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
    const parameters = command.params.map(param => {
        const {consumed, body, typescriptDefinition} = generateParam(param, argumentIndex);
        argumentIndex += consumed;
        return {body, typescriptDefinition};
    });


    // TODO: Split into separate function
    const {returns, returnType, typescriptReturnType} = generateInvocation(pointerName, command.proto, command.params);

    const implementation = `    ${returnType} ${functionName}(const Napi::CallbackInfo& info) {
        ${command.params.map(it => `${it.proto};`).join('\n        ')}
        
${parameters.map(it => it.body).join("\n")}
        
${returns}
    }`;
    const typescriptDefinition = `    ${actualName}(${parameters.map(it => it.typescriptDefinition).join(", ")}): ${typescriptReturnType};`;

    return {typeDef, pointerDeclaration, initDefinition, loadPointer, implementation, typescriptDefinition};
}

module.exports = generateCommand;
