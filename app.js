// app.js
App({
    globalData: {
        userLocation: null,
        partnerLocation: null,
        selectedVenueType: null,
        recommendedVenues: []
    },

    onLaunch() {
        // 更全面的错误处理
        this.fixNodeJsErrors();
        this.handleGlobalErrors();

        // 初始化模拟文件系统
        if (typeof global !== 'undefined') {
            global.fs = {
                accessSync: () => true,
                readFileSync: () => Buffer.from('{}'),
                writeFileSync: () => { },
                existsSync: () => true,
                mkdirSync: () => { },
                readdirSync: () => [],
                statSync: () => ({
                    isDirectory: () => false,
                    isFile: () => true
                })
            };

            // 模拟 Buffer
            if (typeof global.Buffer === 'undefined') {
                global.Buffer = {
                    from: (str) => ({ toString: () => str })
                };
            }
        }

        // 获取用户位置
        wx.getLocation({
            type: 'gcj02',
            success: (res) => {
                this.globalData.userLocation = {
                    latitude: res.latitude,
                    longitude: res.longitude
                };
            },
            fail: () => {
                wx.showToast({
                    title: '请授权位置信息',
                    icon: 'none'
                });
            }
        });
    },

    // 修复Node.js文件系统错误的更强大方法
    fixNodeJsErrors() {
        // 1. 拦截全局错误事件
        wx.onError((error) => {
            // 如果是文件系统错误，静默处理
            if (error.indexOf('not node js file system') > -1 ||
                error.indexOf('no such file or directory') > -1) {
                return;
            }
            // 其他错误正常处理
            console.error('App Error:', error);
        });

        // 2. 拦截未处理的Promise异常
        wx.onUnhandledRejection(({ reason }) => {
            if (reason && typeof reason === 'string' &&
                (reason.indexOf('not node js file system') > -1 ||
                    reason.indexOf('no such file or directory') > -1)) {
                return;
            }
            console.error('Unhandled Promise Rejection:', reason);
        });

        // 3. 替换console.error来过滤文件系统相关错误
        const originalConsoleError = console.error;
        console.error = function () {
            const args = Array.from(arguments);
            const errorString = args.join(' ');

            if (errorString.indexOf('not node js file system') > -1 ||
                errorString.indexOf('no such file or directory') > -1) {
                return; // 不打印这些错误
            }

            return originalConsoleError.apply(console, args);
        };

        // 4. 创建全局模拟文件系统
        if (typeof global !== 'undefined') {
            // 更全面的模拟fs模块
            global.fs = {
                accessSync: function () { return true; },
                readFileSync: function () { return ''; },
                writeFileSync: function () { return; },
                existsSync: function () { return false; },
                readdirSync: function () { return []; },
                mkdirSync: function () { return; },
                statSync: function () {
                    return {
                        isDirectory: () => false,
                        isFile: () => false
                    };
                },
                unlinkSync: function () { return; },
                rmdirSync: function () { return; }
            };

            // 5. 模拟路径模块
            global.path = {
                join: function () {
                    return Array.from(arguments).join('/').replace(/\/+/g, '/');
                },
                resolve: function () {
                    return Array.from(arguments).join('/').replace(/\/+/g, '/');
                },
                dirname: function (p) {
                    return p.split('/').slice(0, -1).join('/') || '/';
                }
            };

            // 6. 处理require可能导致的问题
            if (!global.require) {
                global.require = function (moduleName) {
                    if (moduleName === 'fs' || moduleName === 'path') {
                        return global[moduleName];
                    }
                    return {};
                };
            }
        }

        // 7. 防止WAServiceMainContext.js报错
        try {
            if (typeof global.WeixinJSCore === 'undefined' && typeof WeixinJSCore !== 'undefined') {
                global.WeixinJSCore = WeixinJSCore;
            }
        } catch (e) {
            // 忽略此错误
        }
    },

    // 在App对象中添加全局错误处理函数
    handleGlobalErrors: function () {
        // 捕获页面未捕获的异常
        const originalTriggerEvent = Page.prototype.triggerEvent;
        Page.prototype.triggerEvent = function (eventName, eventDetail) {
            try {
                return originalTriggerEvent.call(this, eventName, eventDetail);
            } catch (error) {
                console.error('事件处理错误:', error);
                wx.showToast({
                    title: '操作出错，请重试',
                    icon: 'none'
                });
                return null;
            }
        };

        // 添加健壮的API调用包装器
        this.safeAPICall = function (apiName, options = {}) {
            const originalSuccess = options.success;
            const originalFail = options.fail;

            options.success = function (res) {
                try {
                    if (originalSuccess) originalSuccess(res);
                } catch (error) {
                    console.error(`API ${apiName} 成功回调发生错误:`, error);
                    if (options.showError !== false) {
                        wx.showToast({
                            title: '处理结果出错',
                            icon: 'none'
                        });
                    }
                }
            };

            options.fail = function (error) {
                console.error(`API ${apiName} 调用失败:`, error);
                if (options.showError !== false) {
                    wx.showToast({
                        title: `${options.errorMsg || '操作失败，请重试'}`,
                        icon: 'none'
                    });
                }
                if (originalFail) originalFail(error);
            };

            try {
                return wx[apiName](options);
            } catch (error) {
                console.error(`调用 API ${apiName} 出错:`, error);
                if (options.showError !== false) {
                    wx.showToast({
                        title: `${options.errorMsg || '操作失败，请重试'}`,
                        icon: 'none'
                    });
                }
                if (originalFail) originalFail(error);
                return null;
            }
        };
    }
}); 