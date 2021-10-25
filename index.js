const {resolve} = require("path");
const {arch, platform} = require("os");
const Noogl = require(
    resolve(
        __dirname,
        "dist",
        process.env.NODE_ENV === "development" ? "Debug" : "Release",
        platform(),
        arch(),
        "noogl.node"
    )
);
module.exports = Noogl;
