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
        isPtrTo: ptrPtr !== undefined,
    };
}

// TODO: Support GLint64, GLuint64
function generateParam(param, argumentIndex) {
    const {name, proto} = param;
    const {type, fullType, isConstPtr, isPtrTo} = parseProto(proto);

    let consumed = 0;
    let body = `        // param: arguments[${argumentIndex}] ${proto}\n`;

    if (isPtrTo) {
        throw new Error(`Pointer-to-pointer parameter not supported: ${fullType}`);
    } else if (type.isPointer) {
        if (type.type === "void") {
            body += `        if (info[${argumentIndex}].IsDataView()) {
            auto dataView{info[${argumentIndex}].As<Napi::DataView>()};
            ${name} = reinterpret_cast<void*>(reinterpret_cast<uint8_t*>(dataView.ArrayBuffer().Data()) + dataView.ByteOffset());
        } else {
            auto arrayBuffer{info[${argumentIndex}].As<Napi::ArrayBuffer>()};
            ${name} = arrayBuffer.Data();
        }`;
        } else {
            body += `        {
            auto typedArray{info[${argumentIndex}].As<Napi::TypedArray>()};
            if (typedArray.ElementSize() != sizeof(${type})) {
                throw Napi::TypeError::New(info.Env(), "Wrong TypedArray element size.");
            }
            uint8_t* arrayBuffer{reinterpret_cast<uint8_t*>(typedArray.ArrayBuffer().Data())};
            ${name} = reinterpret_cast<${type}*>(arrayBuffer + typedArray.ByteOffset());
        }`;
        }
        consumed++;
    } else if (["GLint", "GLuint", "GLsizei", "GLenum", "GLfloat", "GLclampf", "GLdouble", "GLclampd", "GLbitfield", "GLintptr", "GLsizeiptr"].includes(type.type)) {
        body += `        ${name} = info[${argumentIndex}].ToNumber();`
        consumed++;
    } else if (["GLbyte", "GLshort"].includes(type.type)) {
        body += `        ${name} = (${type}) info[${argumentIndex}].ToNumber().Int32Value();`
        consumed++;
    } else if (["GLubyte", "GLushort"].includes(type.type)) {
        body += `        ${name} = (${type}) info[${argumentIndex}].ToNumber().Uint32Value();`
        consumed++;
    } else if (type.type === "GLboolean") {
        body += `        ${name} = (${type}) info[${argumentIndex}].ToBoolean() == true ? 1 : 0;`
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
        returns = `${invoke};`;
        returnType = "void";
    } else {
        returnType = "Napi::Value"
        if (type.isPointer) {
            // TODO: Return as non-owning ArrayBuffer
            throw new Error(`Unsupported pointer return type: ${fullType}`);
        } else if (["GLint", "GLuint", "GLsizei", "GLulong", "GLenum", "GLfloat", "GLclampf", "GLdouble", "GLclampd", "GLbitfield"].includes(type.type)) {
            returns = `return Napi::Number::New(info.Env(), ${invoke});`
        } else if (type.type === "GLboolean") {
            // GLboolean is internally unsigned char.
            returns = `return Napi::Boolean::New(info.Env(), ${invoke} == 1);`;
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
