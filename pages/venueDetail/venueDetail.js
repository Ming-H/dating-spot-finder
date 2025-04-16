const app = getApp();
const QQMapWX = require('../../utils/qqmap-wx-jssdk.min.js');

let qqmapsdk;

Page({
    data: {
        // 场所详情
        venue: null,

        // 地图相关
        latitude: 0,
        longitude: 0,
        markers: [],
        polylines: [],

        // 用户与约会对象位置
        userLocation: null,
        partnerLocation: null,

        // 路线相关
        distance: {
            userToVenue: 0,
            partnerToVenue: 0
        },
        duration: {
            userToVenue: 0,
            partnerToVenue: 0
        },

        // 图片相关
        imgUrls: [
            '/images/venue-placeholder-1.svg',
            '/images/venue-placeholder-2.svg',
            '/images/venue-placeholder-3.svg'
        ],
        currentImgIndex: 0
    },

    onLoad(options) {
        // 初始化地图SDK
        qqmapsdk = new QQMapWX({
            key: 'YA3BZ-7BB64-YB6UP-KKDDU-4GAW2-JSFGY' // 腾讯地图 API 密钥
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
        this.updateMarkers();

        // 计算距离和时间
        this.calculateDistanceAndDuration();

        // 获取场所详情
        this.getVenueDetail();
    },

    // 更新地图标记
    updateMarkers() {
        let markers = [];

        // 添加场所位置标记
        markers.push({
            id: 1,
            latitude: this.data.venue.location.lat,
            longitude: this.data.venue.location.lng,
            width: 30,
            height: 30,
            callout: {
                content: this.data.venue.title,
                padding: 10,
                borderRadius: 5,
                display: 'ALWAYS'
            },
            iconPath: '/images/marker-venue.svg'
        });

        // 添加用户位置标记
        if (this.data.userLocation) {
            markers.push({
                id: 2,
                latitude: this.data.userLocation.latitude,
                longitude: this.data.userLocation.longitude,
                width: 30,
                height: 30,
                callout: {
                    content: '我的位置',
                    padding: 10,
                    borderRadius: 5,
                    display: 'ALWAYS'
                },
                iconPath: '/images/marker-user.svg'
            });
        }

        // 添加约会对象位置标记
        if (this.data.partnerLocation) {
            markers.push({
                id: 3,
                latitude: this.data.partnerLocation.latitude,
                longitude: this.data.partnerLocation.longitude,
                width: 30,
                height: 30,
                callout: {
                    content: '对方位置',
                    padding: 10,
                    borderRadius: 5,
                    display: 'ALWAYS'
                },
                iconPath: '/images/marker-partner.svg'
            });
        }

        this.setData({ markers });

        // 绘制路线
        this.drawRouteLines();

        // 调整地图视野
        this.adjustMapView();
    },

    // 计算距离和时间
    calculateDistanceAndDuration() {
        if (this.data.userLocation) {
            qqmapsdk.calculateDistance({
                from: `${this.data.userLocation.latitude},${this.data.userLocation.longitude}`,
                to: [{
                    latitude: this.data.venue.location.lat,
                    longitude: this.data.venue.location.lng
                }],
                success: (res) => {
                    if (res.status === 0 && res.result.elements.length > 0) {
                        const distance = res.result.elements[0].distance;
                        const duration = res.result.elements[0].duration;

                        this.setData({
                            'distance.userToVenue': distance,
                            'duration.userToVenue': duration
                        });
                    }
                }
            });
        }

        if (this.data.partnerLocation) {
            qqmapsdk.calculateDistance({
                from: `${this.data.partnerLocation.latitude},${this.data.partnerLocation.longitude}`,
                to: [{
                    latitude: this.data.venue.location.lat,
                    longitude: this.data.venue.location.lng
                }],
                success: (res) => {
                    if (res.status === 0 && res.result.elements.length > 0) {
                        const distance = res.result.elements[0].distance;
                        const duration = res.result.elements[0].duration;

                        this.setData({
                            'distance.partnerToVenue': distance,
                            'duration.partnerToVenue': duration
                        });
                    }
                }
            });
        }
    },

    // 获取场所详情
    getVenueDetail() {
        qqmapsdk.getPoiDetail({
            id: this.data.venue.id,
            success: (res) => {
                console.log('场所详情', res);
                if (res.status === 0 && res.data.length > 0) {
                    const detail = res.data[0];

                    // 更新场所信息
                    this.setData({
                        venue: {
                            ...this.data.venue,
                            opening_hours: detail.opening_hours || '',
                            photos: detail.photos || [],
                            website: detail.website || '',
                            rating: detail.rating || 0,
                            review_num: detail.review_num || 0
                        }
                    });
                }
            }
        });
    },

    // 绘制路线
    drawRouteLines() {
        const polylines = [];

        // 用户到场所的路线
        if (this.data.userLocation) {
            this.drawRouteLine(
                {
                    latitude: this.data.userLocation.latitude,
                    longitude: this.data.userLocation.longitude
                },
                {
                    latitude: this.data.venue.location.lat,
                    longitude: this.data.venue.location.lng
                },
                '#5DADE2',
                polylines
            );
        }

        // 约会对象到场所的路线
        if (this.data.partnerLocation) {
            this.drawRouteLine(
                {
                    latitude: this.data.partnerLocation.latitude,
                    longitude: this.data.partnerLocation.longitude
                },
                {
                    latitude: this.data.venue.location.lat,
                    longitude: this.data.venue.location.lng
                },
                '#F1948A',
                polylines
            );
        }
    },

    // 绘制单条路线
    drawRouteLine(from, to, color, polylines) {
        try {
            qqmapsdk.direction({
                mode: 'driving',
                from: `${from.latitude},${from.longitude}`,
                to: `${to.latitude},${to.longitude}`,
                success: (res) => {
                    if (res && res.result && res.result.routes && res.result.routes.length > 0) {
                        const route = res.result.routes[0];
                        const coors = route.polyline;

                        const pl = [];
                        for (let i = 2; i < coors.length; i++) {
                            coors[i] = coors[i - 2] + coors[i] / 1000000;
                        }

                        for (let i = 0; i < coors.length; i += 2) {
                            pl.push({ latitude: coors[i], longitude: coors[i + 1] });
                        }

                        polylines.push({
                            points: pl,
                            color: color,
                            width: 4,
                            dottedLine: false
                        });

                        this.setData({ polylines });
                    } else {
                        console.error('路线数据格式异常:', res);
                        this.generateFallbackRoute(from, to, color, polylines);
                    }
                },
                fail: (error) => {
                    console.error('路线规划失败:', error);

                    // 当API调用失败时生成直线路径作为降级方案
                    this.generateFallbackRoute(from, to, color, polylines);

                    let errorMsg = '规划路线失败';

                    // 处理常见错误码
                    if (error.status === 121) {
                        errorMsg = 'API密钥无效或未授权';
                    } else if (error.status === 348) {
                        errorMsg = '请求超出配额限制';
                    } else if (error.status === 311) {
                        errorMsg = '请求的服务接口或域名未获授权';
                    }

                    wx.showToast({
                        title: errorMsg,
                        icon: 'none',
                        duration: 2000
                    });
                }
            });
        } catch (error) {
            console.error('执行路线规划时发生异常:', error);
            this.generateFallbackRoute(from, to, color, polylines);
        }
    },

    // 新增：当API调用失败时生成简单的直线路径
    generateFallbackRoute(from, to, color, polylines) {
        console.log('生成备用路线...');

        // 创建简单的直线路径
        const points = [
            { latitude: from.latitude, longitude: from.longitude },
            { latitude: to.latitude, longitude: to.longitude }
        ];

        polylines.push({
            points: points,
            color: color,
            width: 4,
            dottedLine: true // 使用虚线表示这是简化的路线
        });

        this.setData({ polylines });
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

        // 添加约会对象位置
        if (this.data.partnerLocation) {
            points.push({
                latitude: this.data.partnerLocation.latitude,
                longitude: this.data.partnerLocation.longitude
            });
        }

        if (points.length >= 2) {
            wx.createMapContext('detailMap').includePoints({
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