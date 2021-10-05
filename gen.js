const FS = require("fs/promises");
const parseOpenGl = require("./lib/ParseOpenGl");
const generateSource = require("./lib/GenerateSource");

(async () => {
    if (process.argv.length < 4) throw new Error("Missing argument.");

    const path = process.argv[2];
    const outputPath = process.argv[3];
    const content = await FS.readFile(path, {encoding: "utf-8"});

    const objects = parseOpenGl(content);
    const source = generateSource(objects);

    debugger;
    await FS.writeFile(outputPath, source);
})().catch(err => {
    console.error(err);
    process.exitCode = 1;
})
