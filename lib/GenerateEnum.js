function generateEnum(en) {
    return {
        declaration: `            StaticValue("${en.name}", Napi::Number::New(env, (double) ${en.value}), napi_enumerable),`,
        typescriptDefinition: `    readonly ${en.name}: GLenum;`,
    };
}
module.exports = generateEnum;
