const FS = require("fs/promises");
const parseOpenGl = require("./lib/ParseOpenGl");
const generateSource = require("./lib/GenerateSource");

(async () => {
    if (process.argv.length < 5) throw new Error("Missing argument.");

    const [glXmlPath, cppOutputPath, dtsOutputPath] = process.argv.slice(2);

    const content = await FS.readFile(glXmlPath, {encoding: "utf-8"});

    const objects = parseOpenGl(content);
    const {cppSource, dtsSource} = generateSource(objects);

    debugger;

    await FS.writeFile(cppOutputPath, cppSource);
    await FS.writeFile(dtsOutputPath, dtsSource);
})().catch(err => {
    console.error(err);
    process.exitCode = 1;
})
