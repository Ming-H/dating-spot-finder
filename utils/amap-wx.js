/**
 * 高德地图微信小程序SDK
 * 基于高德开放平台API封装
 * 文档：https://lbs.amap.com/api/wx/summary
 */

function AMapWX(options) {
    this.key = options.key;
    this.requestConfig = {
        key: options.key,
        s: 'rsx',
        platform: 'WXJS',
        appname: options.key,
        sdkversion: '1.2.0',
        logversion: '2.0'
    };
}

AMapWX.prototype.getWxLocation = function (success, fail) {
    wx.getLocation({
        type: 'gcj02',
        success: success,
        fail: fail
    });
};

AMapWX.prototype.getPoiAround = function (options) {
    var that = this;
    options.iconPath = options.iconPath || 'https://webapi.amap.com/theme/v1.3/markers/n/mark_bs.png';
    var location = options.location || '';
    var querykeywords = options.querykeywords || '';
    var success = options.success || function () { };
    var fail = options.fail || function () { };
    var complete = options.complete || function () { };

    var requestParam = {
        key: that.key,
        keywords: querykeywords,
        types: options.types || '',
        location: location,
        radius: options.radius || '1000',
        offset: options.offset || '20',
        page: options.page || '1',
        extensions: options.extensions || 'all',
        output: 'json'
    };

    wx.request({
        url: 'https://restapi.amap.com/v3/place/around',
        data: requestParam,
        method: 'GET',
        header: {
            'content-type': 'application/json'
        },
        success: function (res) {
            var data = res.data;
            if (data.status === '1') {
                var poiArr = data.pois;
                // 构建marker参数
                var markers = [];
                for (var i = 0; i < poiArr.length; i++) {
                    markers.push({
                        id: i,
                        latitude: parseFloat(poiArr[i].location.split(',')[1]),
                        longitude: parseFloat(poiArr[i].location.split(',')[0]),
                        iconPath: options.iconPath,
                        width: options.iconWidth || 32,
                        height: options.iconHeight || 32,
                        name: poiArr[i].name,
                        address: poiArr[i].address,
                        distance: poiArr[i].distance,
                        tel: poiArr[i].tel,
                        type: poiArr[i].type
                    });
                }
                var resData = {
                    markers: markers,
                    poisData: poiArr
                };
                success(resData);
            } else {
                fail({
                    errCode: data.infocode,
                    errMsg: data.info
                });
            }
        },
        fail: function (errData) {
            fail(errData);
        },
        complete: function (finalData) {
            complete(finalData);
        }
    });
};

AMapWX.prototype.getDrivingRoute = function (options) {
    var that = this;
    var origin = options.origin || '';
    var destination = options.destination || '';
    var success = options.success || function () { };
    var fail = options.fail || function () { };
    var complete = options.complete || function () { };

    var requestParam = {
        key: that.key,
        origin: origin,
        destination: destination,
        strategy: options.strategy || 0,
        extensions: 'all',
        output: 'json'
    };

    wx.request({
        url: 'https://restapi.amap.com/v3/direction/driving',
        data: requestParam,
        method: 'GET',
        header: {
            'content-type': 'application/json'
        },
        success: function (res) {
            var data = res.data;
            if (data.status === '1') {
                success(data);
            } else {
                fail({
                    errCode: data.infocode,
                    errMsg: data.info
                });
            }
        },
        fail: function (errData) {
            fail(errData);
        },
        complete: function (finalData) {
            complete(finalData);
        }
    });
};

AMapWX.prototype.getRegeo = function (options) {
    var that = this;
    options.iconPath = options.iconPath || 'https://webapi.amap.com/theme/v1.3/markers/n/mark_bs.png';
    var location = options.location || '';
    var success = options.success || function () { };
    var fail = options.fail || function () { };
    var complete = options.complete || function () { };

    var requestParam = {
        key: that.key,
        location: location,
        extensions: 'all',
        output: 'json'
    };

    wx.request({
        url: 'https://restapi.amap.com/v3/geocode/regeo',
        data: requestParam,
        method: 'GET',
        header: {
            'content-type': 'application/json'
        },
        success: function (res) {
            var data = res.data;
            if (data.status === '1') {
                var marker = [{
                    id: 0,
                    latitude: location.split(',')[1],
                    longitude: location.split(',')[0],
                    iconPath: options.iconPath,
                    width: options.iconWidth || 32,
                    height: options.iconHeight || 32
                }];
                var regeoData = data.regeocode;
                success({
                    marker: marker,
                    regeocode: regeoData
                });
            } else {
                fail({
                    errCode: data.infocode,
                    errMsg: data.info
                });
            }
        },
        fail: function (err) {
            fail(err);
        },
        complete: function (finalData) {
            complete(finalData);
        }
    });
};

AMapWX.prototype.getInputtips = function (options) {
    var that = this;
    var keywords = options.keywords || '';
    var location = options.location || '';
    var success = options.success || function () { };
    var fail = options.fail || function () { };
    var complete = options.complete || function () { };

    var requestParam = {
        key: that.key,
        keywords: keywords,
        location: location,
        output: 'json'
    };

    wx.request({
        url: 'https://restapi.amap.com/v3/assistant/inputtips',
        data: requestParam,
        method: 'GET',
        header: {
            'content-type': 'application/json'
        },
        success: function (res) {
            var data = res.data;
            if (data.status === '1') {
                success(data);
            } else {
                fail({
                    errCode: data.infocode,
                    errMsg: data.info
                });
            }
        },
        fail: function (errData) {
            fail(errData);
        },
        complete: function (finalData) {
            complete(finalData);
        }
    });
};

module.exports.AMapWX = AMapWX; 