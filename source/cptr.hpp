#pragma once

#include "addon.hpp"
#include <napi.h>

class CPtr : public Napi::ObjectWrap<CPtr> {
    void* ptr_;

public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports)
    {
        auto func{DefineClass(env, "CPtr", {
            InstanceMethod<&CPtr::ArrayBuffer>("arrayBuffer")
        })};

        exports.Set("CPtr", func);

        env.GetInstanceData<NooglAddonData>()->cptrCtorRef = Napi::Persistent(func);

        return exports;
    }

    CPtr(const Napi::CallbackInfo& info)
        : Napi::ObjectWrap<CPtr>(info)
    {
        if (!info[0].IsExternal()) {
            Napi::TypeError::New(info.Env(), "CPtr cannot be constructed from JavaScript.")
                .ThrowAsJavaScriptException();
        }
        ptr_ = info[0].As<Napi::External<void>>().Data();
    }

    void* GetPtr() const
    {
        return ptr_;
    }

    template<typename T>
    T CastPtr() const
    {
        return static_cast<T>(ptr_);
    }

    void SetPtr(void* ptr)
    {
        ptr_ = ptr;
    }

    Napi::Value ArrayBuffer(const Napi::CallbackInfo& info)
    {
        auto arg{info[0]};
        uint32_t length{arg.ToNumber()};

        return Napi::ArrayBuffer::New(info.Env(), ptr_, length);
    }
};
