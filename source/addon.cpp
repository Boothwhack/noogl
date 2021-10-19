#include <napi.h>

#include "cptr.hpp"

Napi::Object NooglClassInit(Napi::Env, Napi::Object);

Napi::Object NooglInit(Napi::Env env, Napi::Object exports)
{
    env.SetInstanceData(new NooglAddonData);

    NooglClassInit(env, exports);
    CPtr::Init(env, exports);

    return exports;
}

NODE_API_MODULE(Noogl, NooglInit)
