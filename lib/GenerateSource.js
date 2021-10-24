const generateType = require("./GenerateType");
const generateCommand = require("./GenerateCommand");
const generateEnum = require("./GenerateEnum");

const supportedFeatures = [
    "GL_VERSION_1_0",
    "GL_VERSION_1_1",
    "GL_VERSION_1_2",
    "GL_VERSION_1_3",
    "GL_VERSION_1_4",
    "GL_VERSION_1_5",
    "GL_VERSION_2_0",
    "GL_VERSION_2_1",
    "GL_VERSION_3_0",
    "GL_VERSION_3_1",
    "GL_VERSION_3_2",
    "GL_VERSION_3_3",
    "GL_VERSION_4_0",
    "GL_VERSION_4_1",
    "GL_VERSION_4_2",
    "GL_VERSION_4_3",
    "GL_VERSION_4_4",
    "GL_VERSION_4_5",
    "GL_VERSION_4_6",
];

function commandToString(command) {
    return `${command.proto}(${command.params.map(it => it.proto).join(", ")})`;
}

function generateSource(parsed) {
    const types = parsed.types.map(generateType);

    const {functions, enums} = parsed.features
        .filter(it => supportedFeatures.includes(it.name))
        .reduce(({functions, enums}, feature) => {
            feature.requires.forEach(it => it.elements.forEach(({type, name}) => {
                switch (type) {
                    case "command":
                        if (functions.has(name)) break;
                        const command = parsed.commandLookup.get(name);
                        try {
                            functions.set(name, generateCommand(command, "Noogl", "load"));
                        } catch (e) {
                            console.error(`Error thrown while generating code for command: "${commandToString(command)}"`, e);
                        }
                        break;
                    case "enum":
                        if (enums.has(name)) break;
                        const en = parsed.enumLookup.get(name);
                        try {
                            enums.set(name, generateEnum(en));
                        } catch (e) {
                            console.error("Error while generating code for enum:", en, e);
                        }
                        break;
                }
            }));
            return {functions, enums};
        }, {functions: new Map(), enums: new Map()});

    const typeDefinitions = types.join('\n');
    const enumDefinitions = Array.from(enums.values()).join('\n');
    const functionsValues = Array.from(functions.values());
    const functionTypeDefs = functionsValues.map(it => it.typeDef).join('\n');
    const functionPointers = functionsValues.map(it => it.pointerDeclaration).join('\n');
    const functionDefinitions = functionsValues.map(it => it.initDefinition).join(',\n');
    const functionImplementations = functionsValues.map(it => it.implementation).join("\n\n");
    const functionLoadPointers = functionsValues.map(it => it.loadPointer).join('\n');

    // language=ObjectiveC format=false
    return `#include "addon.hpp"
#include "cptr.hpp"
#include <napi.h>
#include <type_traits>
#include <vector>

${typeDefinitions}

${functionTypeDefs}

struct Noogl : public Napi::ObjectWrap<Noogl> {
${functionPointers}

    typedef void (*glFunc) (void);
    typedef glFunc (glLoadFunc)(const char*);

    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        auto func{DefineClass(env, "Noogl", {
${functionDefinitions},

${enumDefinitions}
        })};
        
        exports.Set("Noogl", func);
        
        env.GetInstanceData<NooglAddonData>()->nooglCtorRef = Napi::Persistent(func);
        
        return exports;
    }

    Noogl(const Napi::CallbackInfo& info) : Napi::ObjectWrap<Noogl>(info) {
        if (info.Length() != 1 || !info[0].IsExternal()) {
            throw Napi::TypeError::New(info.Env(), "Expected exactly one argument.");
        }
        auto ptr{info[0].As<Napi::External<glLoadFunc>>()};
        glLoadFunc* load{ptr.Data()};
        
${functionLoadPointers}
    }
    
${functionImplementations}
};

Napi::Object NooglClassInit(Napi::Env env, Napi::Object exports) {
    return Noogl::Init(env, exports);
}
`;
}

module.exports = generateSource;
