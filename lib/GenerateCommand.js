const ProtoRegex = /^((const\s)?(\w+)\s(\*{1,2})?)\w+$/;

// TODO: Improve parsing: support const *void *
function parseProto(proto) {
    const match = proto.match(ProtoRegex);
    if (match === null) throw new Error(`Unable to parse proto: "${proto}"`);
    const [_, fullType, cont, type, pointer] = match;
    return {type, isConst: cont !== undefined, fullType: fullType.trim(), pointer};
}

function generateParam(param, argumentIndex) {
    const {name, proto} = param;
    const {type, pointer} = parseProto(proto);

    let consumed = 0;
    let body = `        // param: arguments[${argumentIndex}] ${proto}\n`;
    if (pointer) {
        if (pointer === "**") {
            throw new Error("Pointer-to-pointer not supported.");
        }

        if (type === "void") {
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
    } else if (["GLint", "GLuint", "GLsizei", "GLulong", "GLenum", "GLfloat", "GLclampf", "GLdouble", "GLclampd", "GLbitfield", "GLintptr", "GLsizeiptr"].includes(type)) {
        body += `        ${name} = info[${argumentIndex}].ToNumber();`
        consumed++;
    } else if (["GLbyte", "GLshort"].includes(type)) {
        body += `        ${name} = (${type}) info[${argumentIndex}].ToNumber().Int32Value();`
        consumed++;
    } else if (["GLubyte", "GLushort"].includes(type)) {
        body += `        ${name} = (${type}) info[${argumentIndex}].ToNumber().Uint32Value();`
        consumed++;
    } else if (type === "GLboolean") {
        body += `        ${name} = (${type}) info[${argumentIndex}].ToBoolean() == true ? 1 : 0;`
        consumed++;
    } else if (type === "GLsync") {
        body += `        ${name} = info[${argumentIndex}].As<Napi::External<std::remove_pointer<GLsync>::type>>().Data();`
    } else {
        throw new Error(`Unsupported parameter type: ${type}`);
    }
    return [consumed, body];
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

    const {type: resultType, fullType: fullReturnType, pointer: returnPointer} = parseProto(command.proto);

    // TODO: Split into separate function
    const invoke = `${pointerName}(${command.params.map(it => it.name).join(", ")})`;
    let returns;
    let returnType;
    if (fullReturnType === "void") {
        returns = `${invoke};`;
        returnType = "void";
    } else {
        returnType = "Napi::Value"
        if (returnPointer) {
            // TODO: Return as non-owning ArrayBuffer
            throw new Error(`Unsupported pointer return type: ${fullReturnType}`);
        } else if (["GLint", "GLuint", "GLsizei", "GLulong", "GLenum", "GLfloat", "GLclampf", "GLdouble", "GLclampd", "GLbitfield"].includes(resultType)) {
            returns = `return Napi::Number::New(info.Env(), ${invoke});`
        } else if (resultType === "GLboolean") {
            // GLboolean is internally unsigned char.
            returns = `return Napi::Boolean::New(info.Env(), ${invoke} == 1);`;
        } else {
            throw new Error(`Unsupported return type: ${fullReturnType}`);
        }
    }

    const implementation = `    ${returnType} ${functionName}(const Napi::CallbackInfo& info) {
        ${command.params.map(it => `${it.proto};`).join('\n        ')}
        
${parameters.join("\n")}
        
        ${returns}
    }`

    return {typeDef, pointerDeclaration, initDefinition, loadPointer, implementation};
}

module.exports = generateCommand;
