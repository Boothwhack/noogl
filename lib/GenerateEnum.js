function generateEnum(en) {
    return `            StaticValue("${en.name}", Napi::Number::New(env, (double) ${en.value}), napi_enumerable),`
}
module.exports = generateEnum;
