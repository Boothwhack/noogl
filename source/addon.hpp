#pragma once

#include <napi.h>

struct NooglAddonData {
    Napi::FunctionReference nooglCtorRef;
    Napi::FunctionReference cptrCtorRef;
};
