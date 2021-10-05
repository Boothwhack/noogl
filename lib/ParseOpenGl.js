const XML = require("htmlparser2")
const {getElementsByTagName, textContent, getElements, getElementsByTagType, findAll, find} = require("domutils");

function throwCompositeError(errors) {
    throw new Error(`Multiple errors were thrown:\n\n${errors.map((err, idx) => `Error no. ${idx}/${errors.length}`).join("\n\n")}`);
}

function getSingleByTagName(name, node) {
    const tags = getElementsByTagName(name, node);
    if (tags.length === 0) return null;
    else return tags[0];
}

/**
 * @typedef GlType
 * @type {{
 *     name: string,
 *     definition: string,
 *     comment: (string|undefined),
 * }}
 */

/**
 * @typedef GlEnum
 * @type {{
 *     name: string,
 *     value: string,
 *     namespace: string,
 *     type: (string|undefined),
 *     groups: (string[]|undefined),
 *     vendor: (string|undefined),
 *     comment: (string|undefined),
 *     start: (string|undefined),
 *     end: (string|undefined),
 * }}
 */

/**
 * @typedef GlCommand
 * @type {{
 *     name: string,
 *     proto: string,
 *     ptype: {
 *         name: string,
 *         proto: string,
 *         group: string,
 *         ptype: (string|undefined),
 *     }[],
 * }}
 */

/**
 * @typedef GlFeature
 * @type {{
 *     api: string,
 *     name: string,
 *     number: string,
 *     requires: {
 *         comment: (string|undefined),
 *         elements: {
 *             type: string,
 *             name: string,
 *         }[],
 *     }[],
 * }}
 */

/**
 * @returns {GlType[]}
 */
function parseTypes(doc) {
    const typesTags = getElementsByTagName("types", doc);
    const typeTags = typesTags.flatMap(it => getElementsByTagName("type", it))

    const types = typeTags.map(it => {
        const definition = textContent(it);
        let name = it.attribs["name"];
        if (name === undefined) {
            const nameTag = getSingleByTagName("name", it);
            if (nameTag === null) return {definition, error: new Error("Unable to identify type name.")};

            name = textContent(nameTag);
        }
        return {definition, name, ...it.attribs};
    });

    const errors = types.filter(it => it.error !== undefined);
    if (errors.length > 0) throwCompositeError(errors);

    return types.filter(it => it.error === undefined);
}

/**
 * @returns {GlEnum[]}
 */
function parseEnums(doc) {
    const enumsTags = getElementsByTagName("enums", doc);
    return enumsTags.flatMap(enumsTag => {
        const {namespace, start, end, vendor, type, comment} = enumsTag.attribs;

        return getElementsByTagName("enum", enumsTag.children).map(enumTag => {
            const {value, name, group} = enumTag.attribs;

            return {
                name,
                value,
                groups: group === undefined ? undefined : group.split(','),
                comment,
                namespace,
                start,
                end,
                vendor,
                type
            };
        });
    });
}

/**
 * @returns {GlCommand[]}
 */
function parseCommands(doc) {
    const commandsTags = getElementsByTagName("commands", doc);
    const commandTags = commandsTags.flatMap(it => getElementsByTagName("command", it));

    return commandTags.map(it => {
        const protoTag = getSingleByTagName("proto", it);
        if (protoTag === null) return {error: new Error("No proto tag found.")}

        const proto = textContent(protoTag);
        const nameTag = getSingleByTagName("name", protoTag);
        if (nameTag === null) return {error: new Error("No name tag found."), proto};
        const name = textContent(nameTag);

        const paramTags = getElementsByTagName("param", it);
        const params = paramTags.map(p => {
            const miscTags = getElementsByTagType("tag", p.children);
            const opts = Object.fromEntries(
                miscTags.map(it => [it.name, textContent(it)])
            );
            return {proto: textContent(p), ...p.attribs, ...opts};
        });

        const miscTags = find(it => it.type === "tag" && it.name !== "proto" && it.name !== "param", it.children, false, Number.MAX_VALUE);
        const misc = Object.fromEntries(miscTags.map(it => [it.name, it.attribs]));

        return {name, proto, params, misc};
    });
}

/**
 * @returns {GlFeature[]}
 */
function parseFeatures(doc) {
    const featureTags = getElementsByTagName("feature", doc);
    return featureTags.map(featureTag => {
        const {api, name, number} = featureTag.attribs;

        const requireTags = getElementsByTagName("require", featureTag);
        const requires = requireTags.map(requireTag => ({
            comment: requireTag.attribs.comment,
            elements: getElementsByTagType("tag", requireTag.children).map(it => ({
                type: it.name,
                name: it.attribs.name
            })),
        }))

        return {api, name, number, requires};
    });
}

/**
 * Parses OpenGL specification gl.xml file.
 *
 * @returns {{types: GlType[], enums: GlEnum[], commands: GlCommand[], features: GlFeature[]}}
 */
function parseOpenGl(content) {
    const doc = XML.parseDocument(content, {xmlMode: true});

    const types = parseTypes(doc)
    const enums = parseEnums(doc);
    const commands = parseCommands(doc);
    const features = parseFeatures(doc);

    const typeLookup = new Map(types.map(it => [it.name, it]));
    const enumLookup = new Map(enums.map(it => [it.name, it]));
    const commandLookup = new Map(commands.map(it => [it.name, it]));

    return {types, enums, commands, features, typeLookup, enumLookup, commandLookup};
}

module.exports = parseOpenGl;
