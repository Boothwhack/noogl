process.env.NODE_ENV = "development";

const GLFW = require("@beeswax/node-glfw");
const {Noogl, CPtr} = require("@beeswax/noogl");

const vertexShaderSource = `#version 330 core
layout (location = 0) in vec3 position;
void main()
{
  gl_Position = vec4(position.x, position.y, position.z, 1.0f);
}`;
const fragmentShaderSource = `#version 330 core
out vec4 color;
void main()
{
  color = vec4(1.0f, 0.5f, 0.2f, 1.0f);
}`;

GLFW.windowHint(GLFW.CONTEXT_VERSION_MAJOR, 3);
GLFW.windowHint(GLFW.CONTEXT_VERSION_MINOR, 3);
GLFW.windowHint(GLFW.OPENGL_PROFILE, GLFW.OPENGL_CORE_PROFILE);
GLFW.windowHint(GLFW.RESIZABLE, GLFW.FALSE);

const window = new GLFW.Window(800, 600, "Noogl Test");
window.makeContextCurrent();

const gl = new Noogl(GLFW.getProcAddress);

window.setKeyCallback((key, scancode, action) => {
    if (key === GLFW.KEY_ESCAPE && action === GLFW.PRESS) window.shouldClose = true;
});

const [width, height] = window.getFramebufferSize();

gl.glViewport(0, 0, width, height);

const encoder = new TextEncoder();
const strToBuffer = str => encoder.encode(str);

// Build and compile out shader program
// Vertex shader
const vertexShader = gl.glCreateShader(gl.GL_VERTEX_SHADER);
gl.glShaderSource(vertexShader, 1, [strToBuffer(vertexShaderSource)], new Int32Array([vertexShaderSource.length]));
gl.glCompileShader(vertexShader);
// Check for compile time errors
const i32Array = new Int32Array(1);
gl.glGetShaderiv(vertexShader, Noogl.GL_COMPILE_STATUS, i32Array);
if (i32Array[0] !== Noogl.GL_TRUE) {
    debugger;
}
// Fragment shader
const fragmentShader = gl.glCreateShader(Noogl.GL_FRAGMENT_SHADER);
gl.glShaderSource(fragmentShader, 1, [strToBuffer(fragmentShaderSource)], new Int32Array([fragmentShaderSource.length]));
gl.glCompileShader(fragmentShader);
// Check for compile time errors
gl.glGetShaderiv(fragmentShader, Noogl.GL_COMPILE_STATUS, i32Array);
if (i32Array[0] !== Noogl.GL_TRUE) {
    debugger;
}
// Link shaders
const shaderProgram = gl.glCreateProgram();
gl.glAttachShader(shaderProgram, vertexShader);
gl.glAttachShader(shaderProgram, fragmentShader);
gl.glLinkProgram(shaderProgram);
// Check for linking errors
gl.glGetProgramiv(shaderProgram, Noogl.GL_LINK_STATUS, i32Array);
if (i32Array[0] !== Noogl.GL_TRUE) {
    debugger;
}

// Set up vertex data (and buffer(s)) and attribute pointers
// We add a new set of vertices to form a second triangle (a total of 6 vertices); the vertex attribute configuration remains the same (still one 3-float position vector per vertex)
const vertices = new Float32Array([
    // First triangle
    -0.9, -0.5, 0.0,  // Left
    -0.0, -0.5, 0.0,  // Right
    -0.45, 0.5, 0.0,  // Top
    // Second triangle
    0.0, -0.5, 0.0,   // Left
    0.9, -0.5, 0.0,   // Right
    0.45, 0.5, 0.0,   // Top
]);
const u32Array = new Uint32Array(1);
gl.glGenVertexArrays(1, u32Array);
const vao = u32Array[0];
gl.glGenBuffers(1, u32Array);
const vbo = u32Array[0];
// Bind the Vertex Array Object first, then bind and set vertex buffer(s) and attribute pointer(s).
gl.glBindVertexArray(vao);

gl.glBindBuffer(Noogl.GL_ARRAY_BUFFER, vbo);
gl.glBufferData(Noogl.GL_ARRAY_BUFFER, vertices.byteLength, new DataView(vertices.buffer), Noogl.GL_STATIC_DRAW);

gl.glVertexAttribPointer(0, 3, Noogl.GL_FLOAT, Noogl.GL_FLOAT, 3 * 4, CPtr.fromOffset(0));
gl.glEnableVertexAttribArray(0);

gl.glBindBuffer(Noogl.GL_ARRAY_BUFFER, 0); // Note that this is allowed, the call to glVertexAttribPointer registered VBO as the currently bound vertex buffer object so afterwards we can safely unbind

gl.glBindVertexArray(0); // Unbind VAO (it's always a good thing to unbind any buffer/array to prevent strange bugs)

const onFrame = () => {
    if (window.shouldClose) {
        console.log("Closing window...");
        window.destroyWindow();

        return;
    }

    GLFW.pollEvents();

    // OpenGL Rendering...

    // Clear the colorbuffer
    gl.glClearColor(0.2, 0.3, 0.3, 1.0);
    gl.glClear(Noogl.GL_COLOR_BUFFER_BIT);

    // Draw our first triangle
    gl.glUseProgram(shaderProgram);
    gl.glBindVertexArray(vao);
    gl.glDrawArrays(Noogl.GL_TRIANGLES, 0, 6); // We set the count to 6 since we're drawing 6 vertices not (2 triangles); not 3!

    window.swapBuffers();

    setImmediate(onFrame);
}
setImmediate(onFrame);
