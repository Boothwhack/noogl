#pragma once

#include "addon.hpp"
#include <napi.h>
#include <cstring>

class CPtr : public Napi::ObjectWrap<CPtr> {
    void* ptr_;

public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports)
    {
        auto func{DefineClass(env, "CPtr", {
            StaticMethod<&CPtr::FromOffset>("fromOffset"),
            InstanceMethod<&CPtr::ArrayBuffer>("arrayBuffer"),
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

    static Napi::Value FromOffset(const Napi::CallbackInfo& info)
    {
        uint64_t arg(info[0].ToNumber().Int64Value());
        return info.Env().GetInstanceData<NooglAddonData>()->cptrCtorRef.New(
            {Napi::External<void>::New(info.Env(), (void*) arg)}
        );
    }

    Napi::Value ArrayBuffer(const Napi::CallbackInfo& info)
    {
        auto arg{info[0]};
        uint32_t length{arg.ToNumber()};

        return Napi::ArrayBuffer::New(info.Env(), ptr_, length);
    }

    Napi::Value NullTerminated(const Napi::CallbackInfo& info) {
        auto length{std::strlen(CastPtr<const char*>())};
        return Napi::ArrayBuffer::New(info.Env(), ptr_, length);
    }
};
