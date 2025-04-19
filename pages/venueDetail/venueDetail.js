const app = getApp();
// 引入腾讯地图SDK
const QQMapWX = require('../../utils/qqmap-wx-jssdk.min.js');
let qqmapsdk;
// 添加API调用间隔限制
const API_CALL_INTERVAL = 1000; // 毫秒
let lastDirectionApiCall = 0;

Page({
    data: {
        // 场所详情
        venue: null,

        // 地图相关
        latitude: 0,
        longitude: 0,
        markers: [],
        polyline: [],

        // 用户与约会对象位置
        userLocation: null,
        partnerLocation: null,

        // 路线相关
        distance: 0,
        duration: "",

        // 图片相关
        imgUrls: [
            '/images/venue-placeholder-1.svg',
            '/images/venue-placeholder-2.svg',
            '/images/venue-placeholder-3.svg'
        ],
        currentImgIndex: 0,
        key: '您的腾讯地图API密钥', // 请替换为您自己的腾讯地图API密钥
    },

    onLoad(options) {
        // 初始化腾讯地图SDK
        qqmapsdk = new QQMapWX({
            key: this.data.key
        });

        // 获取场所数据
        const venue = app.globalData.selectedVenue;

        if (!venue) {
            wx.showToast({
                title: '未找到场所信息',
                icon: 'none'
            });
            setTimeout(() => {
                wx.navigateBack();
            }, 1500);
            return;
        }

        this.setData({
            venue: venue,
            latitude: venue.location.lat,
            longitude: venue.location.lng,
            userLocation: app.globalData.userLocation,
            partnerLocation: app.globalData.partnerLocation
        });

        // 更新地图标记
        this.updateAllMarkers();
    },

    onReady: function () {
        // 地图组件准备好后执行
        this.mapCtx = wx.createMapContext('venueMap');

        // 检查定位权限
        wx.getSetting({
            success: (res) => {
                if (!res.authSetting['scope.userLocation']) {
                    wx.authorize({
                        scope: 'scope.userLocation',
                        success: () => {
                            // 授权成功后更新用户位置
                            this.updateUserLocation();
                        },
                        fail: () => {
                            wx.showModal({
                                title: '提示',
                                content: '需要授权位置信息才能规划路线，请在设置中开启定位权限',
                                showCancel: false
                            });
                        }
                    });
                } else {
                    // 已有权限，更新用户位置
                    this.updateUserLocation();
                }
            }
        });
    },

    // 更新用户位置
    updateUserLocation: function () {
        wx.getLocation({
            type: 'gcj02',
            success: (res) => {
                const userLocation = {
                    latitude: res.latitude,
                    longitude: res.longitude
                };

                this.setData({
                    userLocation: userLocation
                });

                // 更新所有标记和路线
                this.updateAllMarkers();
            },
            fail: (err) => {
                console.error('获取用户位置失败:', err);
                wx.showToast({
                    title: '获取位置失败，请检查定位权限',
                    icon: 'none'
                });
            }
        });
    },

    // 更新地图标记
    updateAllMarkers: function () {
        const venue = this.data.venue;
        if (!venue || !venue.location) {
            console.error('缺少场馆信息或位置信息');
            return;
        }

        const markers = [];

        // 添加场馆标记
        markers.push({
            id: 1,
            latitude: venue.location.lat,
            longitude: venue.location.lng,
            width: 32,
            height: 40,
            iconPath: '/images/marker-venue.svg', // 更新为SVG格式
            callout: {
                content: venue.title || '目的地',
                color: '#333333',
                fontSize: 14,
                borderRadius: 5,
                bgColor: '#ffffff',
                padding: 6,
                display: 'ALWAYS'
            }
        });

        // 如果有用户位置，添加用户标记
        if (this.data.userLocation) {
            markers.push({
                id: 0,
                latitude: this.data.userLocation.latitude,
                longitude: this.data.userLocation.longitude,
                width: 32,
                height: 40,
                iconPath: '/images/marker-user.svg', // 更新为SVG格式
                callout: {
                    content: '当前位置',
                    color: '#333333',
                    fontSize: 14,
                    borderRadius: 5,
                    bgColor: '#ffffff',
                    padding: 6,
                    display: 'ALWAYS'
                }
            });

            // 如果有用户位置和场馆位置，绘制路线
            this.drawRouteLine();
        }

        this.setData({
            markers: markers,
            includePoints: markers.map(marker => ({
                latitude: marker.latitude,
                longitude: marker.longitude
            }))
        });
    },

    // 计算距离和时间
    calculateDistanceAndDuration() {
        if (this.data.userLocation) {
            this.getRouteInfo(this.data.venue);
        }

        if (this.data.partnerLocation) {
            this.getRouteInfo(this.data.partnerLocation);
        }
    },

    // 获取场所详情
    getVenueDetail() {
        // 使用腾讯地图SDK获取路线规划
        this.getRouteInfo(this.data.venue);
    },

    // 使用腾讯地图SDK获取路线规划
    getRouteInfo(venueInfo) {
        if (!venueInfo || !venueInfo.latitude || !venueInfo.longitude) {
            wx.showToast({
                title: '无法获取目的地位置',
                icon: 'none'
            });
            return;
        }

        // 获取用户当前位置
        wx.getLocation({
            type: 'gcj02',
            success: (res) => {
                const userLocation = {
                    latitude: res.latitude,
                    longitude: res.longitude
                };

                wx.showLoading({
                    title: '路线规划中...',
                });

                // 使用腾讯地图SDK获取路线规划
                qqmapsdk.direction({
                    mode: 'walking', // 步行模式
                    from: {
                        latitude: userLocation.longitude,
                        longitude: userLocation.latitude
                    },
                    to: {
                        latitude: venueInfo.longitude,
                        longitude: venueInfo.latitude
                    },
                    success: (res) => {
                        wx.hideLoading();

                        if (res.result && res.result.routes && res.result.routes.length > 0) {
                            const route = res.result.routes[0];

                            // 计算预计时间和距离
                            const distance = route.distance;
                            const duration = route.duration;

                            let distanceText = '';
                            if (distance > 1000) {
                                distanceText = (distance / 1000).toFixed(1) + ' 公里';
                            } else {
                                distanceText = distance + ' 米';
                            }

                            let durationText = '';
                            if (duration > 3600) {
                                const hours = Math.floor(duration / 3600);
                                const minutes = Math.floor((duration % 3600) / 60);
                                durationText = hours + ' 小时 ' + (minutes > 0 ? minutes + ' 分钟' : '');
                            } else {
                                durationText = Math.ceil(duration / 60) + ' 分钟';
                            }

                            this.setData({
                                routeInfo: {
                                    distance: distanceText,
                                    duration: durationText
                                }
                            });
                        } else {
                            wx.showToast({
                                title: '无法获取路线信息',
                                icon: 'none'
                            });
                        }
                    },
                    fail: (error) => {
                        wx.hideLoading();
                        wx.showToast({
                            title: '路线规划失败',
                            icon: 'none'
                        });
                        console.error('路线规划失败', error);
                    }
                });
            },
            fail: () => {
                wx.showToast({
                    title: '无法获取当前位置',
                    icon: 'none'
                });
            }
        });
    },

    // 绘制路线
    drawRouteLine: function () {
        const venue = this.data.venue;
        const userLocation = this.data.userLocation;

        if (!venue || !venue.location || !userLocation) {
            console.log('缺少路线规划所需的位置信息');
            return;
        }

        // 显示加载中
        wx.showLoading({ title: '路线规划中...' });

        // 检查API调用频率限制
        const now = Date.now();
        if (now - lastDirectionApiCall < API_CALL_INTERVAL) {
            console.log('路线规划API调用过于频繁，使用直线替代');
            this.generateFallbackRoute();
            return;
        }

        // 更新最后API调用时间
        lastDirectionApiCall = now;

        // 使用腾讯地图SDK计算路线
        qqmapsdk.direction({
            mode: 'walking', // 步行模式
            from: {
                latitude: userLocation.latitude,
                longitude: userLocation.longitude
            },
            to: {
                latitude: venue.location.lat,
                longitude: venue.location.lng
            },
            success: (res) => {
                // 隐藏加载框
                wx.hideLoading();

                if (res.result && res.result.routes && res.result.routes.length > 0) {
                    const route = res.result.routes[0];

                    // 设置路线
                    const polyline = [{
                        points: this.parsePolyline(route.polyline),
                        color: '#FF6B81',
                        width: 6,
                        arrowLine: true
                    }];

                    // 计算步行距离和时间
                    const distance = route.distance;
                    const duration = route.duration;

                    this.setData({
                        polyline: polyline,
                        distance: distance,
                        duration: this.formatDuration(duration)
                    });
                } else {
                    wx.showToast({
                        title: '路线规划失败',
                        icon: 'none'
                    });
                }
            },
            fail: (error) => {
                console.error('路线规划失败', error);
                wx.hideLoading();
                wx.showToast({
                    title: '无法获取路线',
                    icon: 'none'
                });
                // 使用备用方案
                this.generateFallbackRoute();
            }
        });
    },

    // 解析腾讯地图polyline坐标
    parsePolyline: function (polyline) {
        if (!polyline) {
            return [];
        }

        const points = [];
        const len = polyline.length;
        let lat = 0;
        let lng = 0;

        for (let i = 0; i < len; i += 2) {
            lat += polyline[i] / 1000000;
            lng += polyline[i + 1] / 1000000;
            points.push({
                latitude: lat,
                longitude: lng
            });
        }

        return points;
    },

    // 格式化时间
    formatDuration: function (seconds) {
        if (seconds < 60) {
            return seconds + '秒';
        } else if (seconds < 3600) {
            return Math.floor(seconds / 60) + '分钟';
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return hours + '小时' + (minutes > 0 ? minutes + '分钟' : '');
        }
    },

    // 新增：当API调用失败时生成简单的直线路径
    generateFallbackRoute: function () {
        console.log('生成备用路线...');
        wx.hideLoading();

        const venue = this.data.venue;
        const userLocation = this.data.userLocation;

        if (!venue || !venue.location || !userLocation) {
            return;
        }

        // 创建简单的直线路径
        const points = [
            { latitude: userLocation.latitude, longitude: userLocation.longitude },
            { latitude: venue.location.lat, longitude: venue.location.lng }
        ];

        this.setData({
            polyline: [{
                points: points,
                color: '#FF6B81',
                width: 4,
                dottedLine: true // 使用虚线表示这是简化的路线
            }]
        });

        // 计算直线距离（仅供参考）
        const distance = this.calculateDistance(
            userLocation.latitude, userLocation.longitude,
            venue.location.lat, venue.location.lng
        );

        this.setData({
            distance: Math.round(distance),
            duration: '步行约' + Math.round(distance / 80) + '分钟' // 假设步行速度80米/分钟
        });
    },

    // 计算两点之间的直线距离(米)
    calculateDistance: function (lat1, lng1, lat2, lng2) {
        const R = 6371000; // 地球半径，单位米
        const dLat = this.deg2rad(lat2 - lat1);
        const dLng = this.deg2rad(lng2 - lng1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    // 将角度转换为弧度
    deg2rad: function (deg) {
        return deg * (Math.PI / 180);
    },

    // 调整地图视野
    adjustMapView() {
        let points = [];

        // 添加场所位置
        points.push({
            latitude: this.data.venue.location.lat,
            longitude: this.data.venue.location.lng
        });

        // 添加用户位置
        if (this.data.userLocation) {
            points.push({
                latitude: this.data.userLocation.latitude,
                longitude: this.data.userLocation.longitude
            });
        }

        if (points.length >= 2) {
            wx.createMapContext('venueMap').includePoints({
                points: points,
                padding: [80, 80, 80, 80]
            });
        }
    },

    // 拨打电话
    makePhoneCall() {
        if (this.data.venue.tel) {
            wx.makePhoneCall({
                phoneNumber: this.data.venue.tel
            });
        } else {
            wx.showToast({
                title: '暂无电话信息',
                icon: 'none'
            });
        }
    },

    // 查看地图导航
    openMapNavigation() {
        wx.openLocation({
            latitude: this.data.venue.location.lat,
            longitude: this.data.venue.location.lng,
            name: this.data.venue.title,
            address: this.data.venue.address,
            scale: 18
        });
    },

    // 分享约会场所
    onShareAppMessage() {
        return {
            title: `邂逅导航推荐：${this.data.venue.title}`,
            path: '/pages/index/index',
            imageUrl: '/images/share-bg.svg'
        };
    },

    // 轮播图切换
    swiperChange(e) {
        this.setData({
            currentImgIndex: e.detail.current
        });
    },

    // 收藏场所
    toggleFavorite() {
        const venue = this.data.venue;
        venue.isFavorite = !venue.isFavorite;

        this.setData({
            venue: venue
        });

        wx.showToast({
            title: venue.isFavorite ? '收藏成功' : '取消收藏',
            icon: 'success'
        });

        // TODO: 存储收藏信息到本地或服务器
    }
}); 