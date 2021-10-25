cmake_minimum_required(VERSION 3.20)
project(noogl)

set(CMAKE_CXX_STANDARD 14)

include(FetchContent)

# Download OpenGL Registry
FetchContent_Declare(
        OpenGL_Registry
        GIT_REPOSITORY https://github.com/KhronosGroup/OpenGL-Registry
        GIT_TAG 6eca3c2cdc3d1a1147302052e1f1f61cc487b79b # 24/08/2021
)
FetchContent_MakeAvailable(OpenGL_Registry)

add_custom_command(OUTPUT noogl.cpp
        COMMAND
        node ${CMAKE_CURRENT_LIST_DIR}/gen.js
        ${opengl_registry_SOURCE_DIR}/xml/gl.xml
        noogl.cpp
        index.d.ts)

add_library(noogl SHARED noogl.cpp source/cptr.hpp source/addon.cpp source/addon.hpp)

target_include_directories(noogl PRIVATE source)
target_include_directories(noogl PUBLIC include)

find_package(NodeApi 16 REQUIRED)
find_package(NodeAddonApi REQUIRED)

target_link_libraries(noogl PUBLIC NodeApi NodeAddonApi)

set(CMAKE_INSTALL_PREFIX "${CMAKE_CURRENT_LIST_DIR}/dist")
install(TARGETS noogl
        CONFIGURATIONS Debug
        LIBRARY
        DESTINATION "Debug/${NODE_PLATFORM}/${NODE_ARCH}"
        RUNTIME
        DESTINATION "Debug/${NODE_PLATFORM}/${NODE_ARCH}")
install(TARGETS noogl
        CONFIGURATIONS Release
        LIBRARY
        DESTINATION "Release/${NODE_PLATFORM}/${NODE_ARCH}"
        RUNTIME
        DESTINATION "Release/${NODE_PLATFORM}/${NODE_ARCH}")
install(FILES "${CMAKE_CURRENT_BINARY_DIR}/index.d.ts" DESTINATION .)
