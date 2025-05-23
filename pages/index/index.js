// pages/index/index.js
const app = getApp();
// 改用腾讯地图SDK
const QQMapWX = require('../../utils/qqmap-wx-jssdk.min.js');

let qqmapsdk;
let apiCallTimestamp = 0;
const API_CALL_INTERVAL = 30000; // 从10秒改为30秒

// 增加缓存时间
const CACHE_DURATION = 3600000; // 1小时的缓存时间

// 在Page函数外部添加以下配置
const DEFAULT_KEY = 'YA3BZ-7BB64-YB6UP-KKDDU-4GAW2-JSFGY'; // 默认API密钥
const BACKUP_KEYS = [
    'YGLBZ-3BB64-YB6UP-KKDDU-4GAKW-G3FGY', // 备用密钥1
    'YT3BZ-7BB64-YB6UP-KKDDU-4GSWX-WSFAJ'  // 备用密钥2
];
let currentKeyIndex = 0;

// 创建初始化SDK的函数
function initQQMapSDK() {
    const key = currentKeyIndex === 0 ? DEFAULT_KEY : BACKUP_KEYS[currentKeyIndex - 1];
    qqmapsdk = new QQMapWX({ key: key });
    console.log(`初始化地图SDK，使用密钥索引: ${currentKeyIndex}`);
    return qqmapsdk;
}

// 添加配额检查
const checkQuota = async (apiType) => {
    const quotaKey = `${apiType}_quota_${new Date().toDateString()}`;
    const usedQuota = wx.getStorageSync(quotaKey) || 0;

    if (usedQuota >= DAILY_QUOTA[apiType]) {
        return false;
    }

    wx.setStorageSync(quotaKey, usedQuota + 1);
    return true;
};

// 添加批量请求处理
const batchProcess = async (requests) => {
    const results = [];
    for (let i = 0; i < requests.length; i += 5) { // 每次处理5个请求
        const batch = requests.slice(i, i + 5);
        const batchResults = await Promise.all(batch);
        results.push(...batchResults);
        await new Promise(resolve => setTimeout(resolve, 1000)); // 间隔1秒
    }
    return results;
};

Page({
    data: {
        // 地图相关
        latitude: 39.908823,
        longitude: 116.397470,
        scale: 14,
        markers: [],
        polylines: [],

        // 用户与约会对象位置
        userLocation: null,
        partnerLocation: null,

        // 场所类型
        venueTypes: [
            { id: 'restaurant', name: '餐厅', icon: 'icon-restaurant' },
            { id: 'cafe', name: '咖啡厅', icon: 'icon-cafe' },
            { id: 'movie', name: '电影院', icon: 'icon-movie' },
            { id: 'park', name: '公园', icon: 'icon-park' },
            { id: 'shopping', name: '购物中心', icon: 'icon-shopping' },
            { id: 'bar', name: '酒吧', icon: 'icon-bar' }
        ],
        selectedVenueType: null,

        // 推荐场所
        recommendedVenues: [],

        // UI相关
        showVenueList: false,
        inputAddress: '',
        partnerAddress: '',
        loading: false,
        searchHistory: [],
        showHistory: false,
        searchValue: '',
        devForceRefresh: false,

        // 腾讯地图API密钥
        key: 'YA3BZ-7BB64-YB6UP-KKDDU-4GAW2-JSFGY' // 使用您图中显示的API密钥
    },

    onLoad() {
        try {
            // 初始化腾讯地图SDK
            qqmapsdk = initQQMapSDK();
            console.log('地图SDK初始化完成');
        } catch (e) {
            console.error('地图SDK初始化失败:', e);
            wx.showModal({
                title: '初始化失败',
                content: '地图服务初始化失败，请重启小程序',
                showCancel: false
            });
            return;
        }

        // 检查定位权限
        wx.getSetting({
            success: (res) => {
                if (!res.authSetting['scope.userLocation']) {
                    wx.authorize({
                        scope: 'scope.userLocation',
                        success: () => {
                            // 获取用户位置
                            this.getUserLocation();
                        },
                        fail: () => {
                            wx.showModal({
                                title: '位置授权',
                                content: '需要您授权使用位置信息，才能为您提供更好的服务',
                                confirmText: '去设置',
                                success: (res) => {
                                    if (res.confirm) {
                                        wx.openSetting();
                                    }
                                }
                            });
                        }
                    });
                } else {
                    // 获取用户位置
                    this.getUserLocation();
                }
            }
        });

        // 获取本地存储的搜索历史
        const history = wx.getStorageSync('searchHistory') || [];
        this.setData({
            searchHistory: history
        });

        this.loadSearchHistory();

        // 预加载常用区域的数据
        const commonAreas = ['朝阳区', '海淀区', '东城区'];
        commonAreas.forEach(area => {
            this.preloadAreaData(area);
        });

        // 全局处理可能导致 fs 相关错误的代码
        if (typeof global !== 'undefined' && !global.fs) {
            const mockFs = {
                accessSync: function () { return false; },
                readFileSync: function () { return ''; },
                writeFileSync: function () { return; },
                readdirSync: function () { return []; },
                statSync: function () {
                    return {
                        isDirectory: function () { return false; },
                        isFile: function () { return false; }
                    };
                },
                existsSync: function () { return false; },
                mkdirSync: function () { return; },
                unlinkSync: function () { return; }
            };

            global.fs = mockFs;
        }
    },

    // 获取用户位置
    getUserLocation() {
        wx.getLocation({
            type: 'gcj02',
            success: (res) => {
                console.log('成功获取用户位置:', res);
                this.setData({
                    latitude: res.latitude,
                    longitude: res.longitude,
                    userLocation: res,
                    markers: this.data.markers.map(marker => {
                        if (marker.id === 0) {
                            return {
                                ...marker,
                                latitude: res.latitude,
                                longitude: res.longitude
                            };
                        }
                        return marker;
                    })
                });
                app.globalData.userLocation = res;

                this.adjustMapViewToUserLocation();
            },
            fail: (err) => {
                console.error('获取用户位置失败:', err);
                wx.showToast({
                    title: '获取位置失败',
                    icon: 'none'
                });
            }
        });
    },

    // 新增方法：调整地图视野以包含用户位置（如果地图已加载）
    adjustMapViewToUserLocation() {
        if (this.data.latitude && this.data.longitude && wx.createMapContext('meetupMap')) {
            wx.createMapContext('meetupMap').moveToLocation({
                latitude: this.data.latitude,
                longitude: this.data.longitude
            });
        }
    },

    // 更新地图标记，确保显示精确位置
    updateMarkers() {
        let markers = [];

        // 添加用户位置标记
        if (this.data.userLocation) {
            markers.push({
                id: 1,
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
                id: 2,
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

        // 计算中点位置
        if (this.data.userLocation && this.data.partnerLocation) {
            const midLat = (this.data.userLocation.latitude + this.data.partnerLocation.latitude) / 2;
            const midLng = (this.data.userLocation.longitude + this.data.partnerLocation.longitude) / 2;

            // 添加中点标记
            markers.push({
                id: 999,
                latitude: midLat,
                longitude: midLng,
                width: 26,
                height: 26,
                iconPath: '/images/marker-midpoint.svg',
                callout: {
                    content: '中点',
                    padding: 8,
                    borderRadius: 4,
                    display: 'ALWAYS'
                }
            });
        }

        // 为每种场所类型使用不同的标记图标
        const venueIconMap = {
            'restaurant': '/images/marker-restaurant.svg',
            'cafe': '/images/marker-cafe.svg',
            'movie': '/images/marker-movie.svg',
            'park': '/images/marker-park.svg',
            'shopping': '/images/marker-shopping.svg',
            'bar': '/images/marker-bar.svg'
        };

        // 添加推荐场所标记
        this.data.recommendedVenues.forEach((venue, index) => {
            const venueType = venue.type || 'default';
            const iconPath = venueIconMap[venueType] || '/images/marker-venue.svg';

            markers.push({
                id: index + 3,
                latitude: venue.location.lat,
                longitude: venue.location.lng,
                width: 30,
                height: 30,
                callout: {
                    content: venue.title,
                    padding: 10,
                    borderRadius: 5,
                    display: 'BYCLICK'
                },
                iconPath: iconPath
            });
        });

        this.setData({ markers });

        // 如果两个位置都有了，绘制路线
        if (this.data.userLocation && this.data.partnerLocation) {
            this.drawRouteLine();

            // 调整地图视野
            this.adjustMapView();
        }
    },

    // 搜索用户地址按钮点击事件
    searchUserAddress() {
        wx.chooseLocation({
            success: (res) => {
                console.log('用户选择自己的位置:', res);

                // 如果用户选择了位置
                if (res.name || res.address) {
                    // 保存地址到输入框
                    this.setData({
                        inputAddress: res.name || res.address,
                        userLocation: {
                            latitude: res.latitude,
                            longitude: res.longitude
                        }
                    });

                    // 存入全局数据
                    app.globalData.userLocation = {
                        latitude: res.latitude,
                        longitude: res.longitude
                    };

                    // 更新地图标记
                    this.updateMarkers();

                    // 调整地图视野
                    this.adjustMapView();
                }
            },
            fail: (err) => {
                if (err.errMsg !== "chooseLocation:fail cancel") {
                    console.error('选择位置失败:', err);
                    wx.showToast({
                        title: '选择位置失败',
                        icon: 'none'
                    });
                }
            }
        });
    },

    // 搜索约会对象地址按钮点击事件
    searchPartnerAddress() {
        wx.chooseLocation({
            success: (res) => {
                console.log('用户选择对方位置:', res);

                // 如果用户选择了位置
                if (res.name || res.address) {
                    // 保存地址到输入框
                    this.setData({
                        partnerAddress: res.name || res.address,
                        partnerLocation: {
                            latitude: res.latitude,
                            longitude: res.longitude
                        }
                    });

                    // 存入全局数据
                    app.globalData.partnerLocation = {
                        latitude: res.latitude,
                        longitude: res.longitude
                    };

                    // 更新地图标记
                    this.updateMarkers();

                    // 调整地图视野
                    this.adjustMapView();
                }
            },
            fail: (err) => {
                if (err.errMsg !== "chooseLocation:fail cancel") {
                    console.error('选择位置失败:', err);
                    wx.showToast({
                        title: '选择位置失败',
                        icon: 'none'
                    });
                }
            }
        });
    },

    // 调整地图视野以包含所有标记
    adjustMapView() {
        const mapContext = wx.createMapContext('meetupMap');

        // 收集需要包含在视野中的点
        let points = [];

        if (this.data.userLocation) {
            points.push({
                latitude: this.data.userLocation.latitude,
                longitude: this.data.userLocation.longitude
            });
        }

        if (this.data.partnerLocation) {
            points.push({
                latitude: this.data.partnerLocation.latitude,
                longitude: this.data.partnerLocation.longitude
            });
        }

        // 添加推荐场所的位置点
        if (this.data.recommendedVenues && this.data.recommendedVenues.length > 0) {
            this.data.recommendedVenues.forEach(venue => {
                if (venue.location) {
                    points.push({
                        latitude: venue.location.lat,
                        longitude: venue.location.lng
                    });
                }
            });
        }

        // 如果有多个点，调整视野包含所有点
        if (points.length > 0) {
            mapContext.includePoints({
                points: points,
                padding: [80, 80, 80, 80]
            });
        }
    },

    // 使用当前位置按钮点击事件
    useCurrentLocation() {
        wx.getLocation({
            type: 'gcj02',
            success: (res) => {
                // 设置为用户位置
                this.setData({
                    inputAddress: '当前位置',
                    userLocation: {
                        latitude: res.latitude,
                        longitude: res.longitude
                    }
                });

                // 存入全局数据
                app.globalData.userLocation = {
                    latitude: res.latitude,
                    longitude: res.longitude
                };

                // 更新地图标记
                this.updateMarkers();

                // 调整地图视野
                this.adjustMapView();
            },
            fail: (err) => {
                console.error('获取当前位置失败:', err);
                wx.showToast({
                    title: '获取位置失败',
                    icon: 'none'
                });
            }
        });
    },

    // 用户位置输入框输入事件
    inputUserAddress(e) {
        this.setData({
            inputAddress: e.detail.value
        });
    },

    // 约会对象位置输入框输入事件
    inputPartnerAddress(e) {
        this.setData({
            partnerAddress: e.detail.value
        });
    },

    // 地图点击事件
    onMapTap(e) {
        console.log('Map tapped', e);
    },

    // 标记点击事件
    onMarkerTap(e) {
        const markerId = e.detail.markerId;
        // 如果是推荐场所的标记
        if (markerId >= 3) {
            const venue = this.data.recommendedVenues[markerId - 3];
            app.globalData.selectedVenue = venue;

            wx.navigateTo({
                url: '/pages/venueDetail/venueDetail'
            });
        }
    },

    // 选择场所类型
    selectVenueType(e) {
        const typeId = e.currentTarget.dataset.id;
        this.setData({
            selectedVenueType: typeId
        });

        app.globalData.selectedVenueType = typeId;
    },

    // 寻找约会场所按钮 - 优化搜索流程
    findVenues: function () {
        if (!this.data.userLocation || !this.data.partnerLocation) {
            wx.showToast({
                title: '请先设置两个位置',
                icon: 'none'
            });
            return;
        }

        if (!this.data.selectedVenueType) {
            wx.showToast({
                title: '请选择场所类型',
                icon: 'none'
            });
            return;
        }

        wx.showLoading({
            title: '正在搜索最佳场所...',
            mask: true
        });

        this.setData({ loading: true });

        const midPoint = this.calculateDirectMidPoint();
        if (!midPoint) {
            wx.hideLoading();
            wx.showToast({
                title: '计算中点失败',
                icon: 'none'
            });
            return;
        }

        const searchRadius = this.calculateSearchRadius(
            this.data.userLocation,
            this.data.partnerLocation
        );

        this.improvedVenueSearch(midPoint, searchRadius)
            .then(venues => {
                wx.hideLoading();
                if (venues && venues.length > 0) {
                    this.processSearchResults(venues);
                } else {
                    // 如果第一次搜索失败，尝试扩大范围
                    return this.extendedSearch(midPoint, searchRadius * 1.5);
                }
            })
            .catch(error => {
                console.error('场所搜索出错:', error);
                wx.hideLoading();
                wx.showToast({
                    title: '搜索失败，请重试',
                    icon: 'none',
                    duration: 2000
                });
            })
            .finally(() => {
                this.setData({ loading: false });
            });
    },

    // 新增：计算合适的搜索半径
    calculateSearchRadius: function (userLoc, partnerLoc) {
        // 计算两点之间的距离
        const distance = this.calculateDistance(
            userLoc.latitude,
            userLoc.longitude,
            partnerLoc.latitude,
            partnerLoc.longitude
        );

        // 基础搜索半径为两点距离的一半，但不小于1000米，不大于5000米
        let radius = Math.max(1000, Math.min(5000, distance / 2));

        // 根据场所类型调整搜索半径
        const typeRadiusAdjustment = {
            'restaurant': 0.8,  // 餐厅搜索范围可以小一些
            'cafe': 0.8,       // 咖啡厅搜索范围小一些
            'movie': 1.2,      // 电影院可以远一些
            'park': 1.2,       // 公园可以远一些
            'shopping': 1.0,   // 购物中心标准范围
            'bar': 0.9         // 酒吧范围适中
        };

        radius *= (typeRadiusAdjustment[this.data.selectedVenueType] || 1.0);

        return Math.round(radius);
    },

    // 改进的场所搜索方法
    improvedVenueSearch: function (midPoint, radius) {
        return new Promise((resolve, reject) => {
            // 检查并格式化位置参数
            if (!midPoint || !midPoint.latitude || !midPoint.longitude) {
                console.error('无效的位置参数:', midPoint);
                reject(new Error('无效的位置参数'));
                return;
            }

            // 确保经纬度是数字类型
            const lat = parseFloat(midPoint.latitude);
            const lng = parseFloat(midPoint.longitude);

            // 验证经纬度范围
            if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                console.error('经纬度超出范围:', lat, lng);
                reject(new Error('经纬度超出范围'));
                return;
            }

            // 构建搜索配置
            const searchConfig = {
                keyword: this.getSearchKeywords(),
                location: {
                    latitude: lat,
                    longitude: lng
                },
                page_size: 20,
                radius: Math.min(radius, 50000), // 确保半径不超过50km
                filter: this.getVenueFilter(),
                success: (res) => {
                    if (res && res.data) {
                        console.log('搜索结果:', res.data);
                        const processedVenues = this.processVenueResults(res.data);
                        resolve(processedVenues);
                    } else {
                        console.log('未找到结果');
                        resolve([]);
                    }
                },
                fail: (error) => {
                    console.error('搜索失败:', error);
                    // 尝试使用备用密钥
                    this.handleSearchFailure(error)
                        .then(resolve)
                        .catch(reject);
                },
                complete: () => {
                    console.log('搜索完成');
                }
            };

            try {
                console.log('发起搜索请求:', searchConfig);
                qqmapsdk.search(searchConfig);
            } catch (error) {
                console.error('搜索请求异常:', error);
                reject(error);
            }
        });
    },

    // 新增：处理搜索失败的方法
    handleSearchFailure: function (error) {
        return new Promise((resolve, reject) => {
            // 如果是密钥相关错误，尝试切换到备用密钥
            if (error.status === 348 || error.code === 348) {
                console.log('尝试切换到备用密钥');
                currentKeyIndex = (currentKeyIndex + 1) % (BACKUP_KEYS.length + 1);
                qqmapsdk = initQQMapSDK(); // 重新初始化SDK

                // 延迟500ms后重试
                setTimeout(() => {
                    this.improvedVenueSearch(this.calculateDirectMidPoint(), this.calculateSearchRadius(
                        this.data.userLocation,
                        this.data.partnerLocation
                    ))
                        .then(resolve)
                        .catch(reject);
                }, 500);
            } else {
                reject(error);
            }
        });
    },

    // 获取搜索关键词
    getSearchKeywords: function () {
        const keywordMap = {
            'restaurant': '餐厅',
            'cafe': '咖啡厅',
            'movie': '电影院',
            'park': '公园',
            'shopping': '购物中心',
            'bar': '酒吧'
        };
        // 确保返回简单的关键词
        return keywordMap[this.data.selectedVenueType] || '';
    },

    // 获取场所过滤条件
    getVenueFilter: function () {
        // 简化过滤条件
        return '';  // 暂时移除过滤条件，以提高搜索成功率
    },

    // 处理场所搜索结果
    processVenueResults: function (venues) {
        return venues
            .filter(venue =>
                venue.location &&
                this.isValidLocation(venue.location.lat, venue.location.lng) &&
                this.isWithinReasonableDistance(venue.location)
            )
            .map(venue => ({
                id: venue.id,
                title: venue.title,
                address: venue.address,
                location: {
                    lat: venue.location.lat,
                    lng: venue.location.lng
                },
                category: venue.category,
                type: this.data.selectedVenueType,
                distance: {
                    user: this.calculateDistance(
                        this.data.userLocation.latitude,
                        this.data.userLocation.longitude,
                        venue.location.lat,
                        venue.location.lng
                    ),
                    partner: this.calculateDistance(
                        this.data.partnerLocation.latitude,
                        this.data.partnerLocation.longitude,
                        venue.location.lat,
                        venue.location.lng
                    )
                }
            }))
            .sort((a, b) => {
                // 计算综合评分（距离平衡性）
                const scoreA = this.calculateVenueScore(a);
                const scoreB = this.calculateVenueScore(b);
                return scoreB - scoreA;
            })
            .slice(0, 10);  // 只返回最佳的10个结果
    },

    // 检查位置是否在合理距离内
    isWithinReasonableDistance: function (location) {
        const maxDistance = 10000; // 10公里
        const userDist = this.calculateDistance(
            this.data.userLocation.latitude,
            this.data.userLocation.longitude,
            location.lat,
            location.lng
        );
        const partnerDist = this.calculateDistance(
            this.data.partnerLocation.latitude,
            this.data.partnerLocation.longitude,
            location.lat,
            location.lng
        );
        return userDist <= maxDistance && partnerDist <= maxDistance;
    },

    // 计算场所评分
    calculateVenueScore: function (venue) {
        const distanceBalance = Math.min(venue.distance.user, venue.distance.partner) /
            Math.max(venue.distance.user, venue.distance.partner);
        const totalDistance = venue.distance.user + venue.distance.partner;

        // 评分权重
        const balanceWeight = 0.6;
        const distanceWeight = 0.4;

        // 距离评分（越近越好）
        const distanceScore = 1 - (totalDistance / 20000); // 20km作为最大参考距离

        return (distanceBalance * balanceWeight) + (distanceScore * distanceWeight);
    },

    // 简化路线规划函数
    drawRouteLine() {
        const from = {
            latitude: this.data.userLocation.latitude,
            longitude: this.data.userLocation.longitude
        };

        const to = {
            latitude: this.data.partnerLocation.latitude,
            longitude: this.data.partnerLocation.longitude
        };

        // 直接使用直线连接
        this.generateDirectLine(from, to);
    },

    // 生成直线路径
    generateDirectLine(from, to) {
        console.log('生成直线路径...');
        const points = [
            { latitude: from.latitude, longitude: from.longitude },
            { latitude: to.latitude, longitude: to.longitude }
        ];

        // 计算中点
        const midLat = (from.latitude + to.latitude) / 2;
        const midLng = (from.longitude + to.longitude) / 2;

        // 更新现有标记，添加中点标记
        let newMarkers = [...this.data.markers];

        // 检查是否已存在中点标记（ID为999）
        const midPointMarkerIndex = newMarkers.findIndex(m => m.id === 999);
        const midPointMarker = {
            id: 999,
            latitude: midLat,
            longitude: midLng,
            width: 26,
            height: 26,
            iconPath: '/images/marker-midpoint.svg', // 确保您有中点标记图标
            callout: {
                content: '中点',
                padding: 8,
                borderRadius: 4,
                display: 'ALWAYS'
            }
        };

        if (midPointMarkerIndex >= 0) {
            // 更新现有中点标记
            newMarkers[midPointMarkerIndex] = midPointMarker;
        } else {
            // 添加新的中点标记
            newMarkers.push(midPointMarker);
        }

        this.setData({
            polylines: [{
                points: points,
                color: '#FF6B81',
                width: 4,
                dottedLine: true
            }],
            markers: newMarkers
        });
    },

    // 查看场所详情
    viewVenueDetail(e) {
        const index = e.currentTarget.dataset.index;
        const venue = this.data.recommendedVenues[index];
        app.globalData.selectedVenue = venue;

        wx.navigateTo({
            url: '/pages/venueDetail/venueDetail'
        });
    },

    // 切换场所列表显示
    toggleVenueList() {
        this.setData({
            showVenueList: !this.data.showVenueList
        });
    },

    // 加载搜索历史
    loadSearchHistory() {
        const history = wx.getStorageSync('searchHistory') || [];
        this.setData({
            searchHistory: history
        });
    },

    // 保存搜索历史
    saveSearchHistory(address) {
        let history = this.data.searchHistory;

        // 如果已存在相同地址，先删除旧的
        history = history.filter(item => item !== address);

        // 将新地址添加到开头
        history.unshift(address);

        // 限制历史记录最多保存10条
        if (history.length > 10) {
            history = history.slice(0, 10);
        }

        // 更新本地存储和数据
        wx.setStorageSync('searchHistory', history);
        this.setData({
            searchHistory: history
        });
    },

    // 清除搜索历史
    clearSearchHistory() {
        wx.removeStorageSync('searchHistory');
        this.setData({
            searchHistory: [],
            showHistory: false
        });
    },

    // 点击历史记录项
    onHistoryItemTap(e) {
        const address = e.currentTarget.dataset.address;
        this.setData({
            inputAddress: address,
            showHistory: false
        });
        this.searchUserAddress();
    },

    // 显示/隐藏历史记录
    toggleHistory() {
        this.setData({
            showHistory: !this.data.showHistory
        });
    },

    // 输入框输入事件
    onSearchInput(e) {
        this.setData({
            searchValue: e.detail.value,
            showHistory: true
        });
    },

    // 点击搜索按钮
    onSearch() {
        wx.chooseLocation({
            success: (res) => {
                console.log('用户选择的位置:', res);
                // 如果用户选择了位置
                if (res.name || res.address) {
                    // 保存搜索历史（如果有地点名称）
                    if (res.name) {
                        this.saveSearchHistory(res.name);
                    }

                    // 创建标记
                    const marker = {
                        id: 100,
                        latitude: res.latitude,
                        longitude: res.longitude,
                        title: res.name,
                        iconPath: '/images/marker-venue.svg',
                        width: 32,
                        height: 32,
                        callout: {
                            content: res.name || res.address,
                            padding: 10,
                            borderRadius: 5,
                            display: 'BYCLICK'
                        }
                    };

                    // 更新地图
                    this.setData({
                        markers: [marker],
                        latitude: res.latitude,
                        longitude: res.longitude,
                        showHistory: false
                    });

                    // 调整地图视野
                    setTimeout(() => {
                        wx.createMapContext('meetupMap').includePoints({
                            points: [{
                                latitude: res.latitude,
                                longitude: res.longitude
                            }],
                            padding: [50, 50, 50, 50]
                        });
                    }, 300);
                }
            },
            fail: (err) => {
                console.error('选择位置失败:', err);
                wx.showToast({
                    title: '选择位置失败',
                    icon: 'none'
                });
            }
        });
    },

    // 点击历史记录时的处理
    onHistoryTap(e) {
        // 获取点击的关键词
        const keyword = e.currentTarget.dataset.value;

        // 设置到搜索框
        this.setData({
            searchValue: keyword,
            showHistory: false
        });

        // 尝试直接打开位置选择器
        wx.chooseLocation({
            success: (res) => {
                // 与onSearch中的处理逻辑相同
                console.log('历史记录-用户选择的位置:', res);

                if (res.name || res.address) {
                    const marker = {
                        id: 100,
                        latitude: res.latitude,
                        longitude: res.longitude,
                        title: res.name,
                        iconPath: '/images/marker-venue.svg',
                        width: 32,
                        height: 32,
                        callout: {
                            content: res.name || res.address,
                            padding: 10,
                            borderRadius: 5,
                            display: 'BYCLICK'
                        }
                    };

                    this.setData({
                        markers: [marker],
                        latitude: res.latitude,
                        longitude: res.longitude
                    });

                    setTimeout(() => {
                        wx.createMapContext('meetupMap').includePoints({
                            points: [{
                                latitude: res.latitude,
                                longitude: res.longitude
                            }],
                            padding: [50, 50, 50, 50]
                        });
                    }, 300);
                }
            }
        });
    },

    // 添加一个新的方法，供搜索框输入后回车时调用
    bindconfirm() {
        this.onSearch();
    },

    // 使用腾讯地图SDK搜索位置
    searchLocation: function (e) {
        let that = this;
        let keyword = e.detail.value;

        if (!keyword.trim()) {
            wx.showToast({
                title: '请输入搜索关键词',
                icon: 'none'
            });
            return;
        }

        wx.showLoading({
            title: '正在搜索...',
        });

        // 保存搜索历史
        this.saveSearchHistory(keyword);

        // 使用腾讯地图SDK搜索POI
        qqmapsdk.getSuggestion({
            keyword: keyword,
            region: '全国',
            success: function (res) {
                wx.hideLoading();
                if (res && res.data) {
                    let markers = [];
                    let searchResults = [];

                    res.data.forEach((item, index) => {
                        if (item.location) {
                            let marker = {
                                id: index,
                                latitude: item.location.lat,
                                longitude: item.location.lng,
                                title: item.title,
                                callout: {
                                    content: item.title,
                                    color: '#000000',
                                    fontSize: 12,
                                    borderRadius: 3,
                                    bgColor: '#ffffff',
                                    padding: 5,
                                    display: 'BYCLICK'
                                },
                                iconPath: '../../images/marker-user.svg',
                                width: 30,
                                height: 30
                            };
                            markers.push(marker);

                            searchResults.push({
                                id: index,
                                name: item.title,
                                address: item.address,
                                latitude: item.location.lat,
                                longitude: item.location.lng
                            });
                        }
                    });

                    that.setData({
                        markers: markers,
                        searchResults: searchResults
                    });

                    // 如果有结果，移动地图到第一个结果位置
                    if (markers.length > 0) {
                        that.setData({
                            latitude: markers[0].latitude,
                            longitude: markers[0].longitude
                        });
                    }
                } else {
                    wx.showToast({
                        title: '未找到相关位置',
                        icon: 'none'
                    });
                }
            },
            fail: function (error) {
                wx.hideLoading();
                wx.showModal({
                    title: '搜索失败',
                    content: '请检查网络连接或API密钥配置',
                    showCancel: false
                });
                console.error(error);
            }
        });
    },

    // 添加预加载函数
    preloadAreaData(area) {
        // 实现预加载逻辑
        console.log(`预加载${area}的数据`);
    },

    // 计算两点之间的直线中点 (简化版)
    calculateDirectMidPoint: function () {
        const userLoc = this.data.userLocation;
        const partnerLoc = this.data.partnerLocation;

        if (!userLoc || !partnerLoc) {
            console.error('无法计算中点：缺少位置信息');
            return null;
        }

        return {
            latitude: (userLoc.latitude + partnerLoc.latitude) / 2,
            longitude: (userLoc.longitude + partnerLoc.longitude) / 2
        };
    },

    // 修改搜索场所的方法，提高位置精确度
    searchVenuesAtMidPoint: function (midPoint) {
        return new Promise((resolve, reject) => {
            if (!midPoint) {
                reject('没有有效的中间点');
                return;
            }

            const venueType = this.data.selectedVenueType;

            // 更新搜索配置
            const searchConfig = {
                'restaurant': {
                    keywords: '餐厅',
                    filter: 'category=餐饮服务',
                    radius: 3000
                },
                'cafe': {
                    keywords: '咖啡厅',
                    filter: 'category=咖啡厅',
                    radius: 3000
                },
                'movie': {
                    keywords: '电影院',
                    filter: 'category=电影院',
                    radius: 5000
                },
                'park': {
                    keywords: '公园',
                    filter: 'category=公园',
                    radius: 5000
                },
                'shopping': {
                    keywords: '购物中心',
                    filter: 'category=购物',
                    radius: 3000
                },
                'bar': {
                    keywords: '酒吧',
                    filter: 'category=酒吧',
                    radius: 3000
                }
            }[venueType] || { keywords: venueType, filter: '', radius: 3000 };

            // 执行多区域搜索
            const searchPoints = this.getSearchPoints(midPoint);

            Promise.all(searchPoints.map(point =>
                this.searchAtPoint(point.location, searchConfig, point.weight)
            ))
                .then(results => {
                    // 合并所有搜索结果
                    let allVenues = [];
                    results.forEach(result => {
                        if (result && result.length) {
                            allVenues = [...allVenues, ...result];
                        }
                    });

                    // 去重并过滤
                    const uniqueVenues = this.deduplicateVenues(allVenues);

                    if (uniqueVenues.length > 0) {
                        return this.fetchDetailedLocationInfo(uniqueVenues);
                    } else {
                        // 如果没有找到结果，扩大搜索范围
                        return this.extendedSearch(midPoint, {
                            ...searchConfig,
                            radius: searchConfig.radius * 2
                        });
                    }
                })
                .then(venues => {
                    resolve(venues);
                })
                .catch(error => {
                    console.error('搜索过程出错:', error);
                    reject(error);
                });
        });
    },

    // 新增：获取多个搜索点
    getSearchPoints: function (midPoint) {
        const userLoc = this.data.userLocation;
        const partnerLoc = this.data.partnerLocation;

        return [
            {
                location: midPoint,
                weight: 1.0
            },
            {
                location: {
                    latitude: (userLoc.latitude * 2 + partnerLoc.latitude) / 3,
                    longitude: (userLoc.longitude * 2 + partnerLoc.longitude) / 3
                },
                weight: 0.8
            },
            {
                location: {
                    latitude: (userLoc.latitude + partnerLoc.latitude * 2) / 3,
                    longitude: (userLoc.longitude + partnerLoc.longitude * 2) / 3
                },
                weight: 0.8
            }
        ];
    },

    // 修改：单点搜索函数
    searchAtPoint: function (location, config, weight = 1.0) {
        return new Promise((resolve) => {
            qqmapsdk.search({
                keyword: config.keywords,
                location: `${location.latitude},${location.longitude}`,
                page_size: 20,
                radius: config.radius,
                filter: config.filter,
                success: (res) => {
                    if (res && res.data && res.data.length > 0) {
                        const venues = res.data
                            .filter(item =>
                                item.location &&
                                this.isValidLocation(item.location.lat, item.location.lng)
                            )
                            .map(item => ({
                                ...this.formatVenue(item),
                                searchWeightFactor: weight
                            }));
                        resolve(venues);
                    } else {
                        resolve([]);
                    }
                },
                fail: () => resolve([])
            });
        });
    },

    // 新增：格式化场所数据
    formatVenue: function (item) {
        return {
            id: item.id,
            title: item.title,
            address: item.address,
            location: {
                lat: item.location.lat,
                lng: item.location.lng
            },
            category: item.category,
            type: this.data.selectedVenueType,
            tel: item.tel || '',
            photos: item.photos || [],
            rawData: item
        };
    },

    // 新增: 获取场所的详细位置信息
    fetchDetailedLocationInfo: function (venues) {
        return new Promise((resolve, reject) => {
            if (!venues || venues.length === 0) {
                resolve([]);
                return;
            }

            const detailPromises = venues.map(venue => {
                return new Promise((resolveDetail) => {
                    // 使用腾讯地图POI详情接口获取更精确的信息
                    qqmapsdk.getPoiDetail({
                        id: venue.rawData.id,
                        success: (detailRes) => {
                            if (detailRes && detailRes.data) {
                                const detailData = detailRes.data;

                                // 更新场所信息
                                venue.location = {
                                    lat: detailData.location.lat,
                                    lng: detailData.location.lng
                                };

                                // 更新详细信息
                                venue.tel = detailData.tel || venue.tel;
                                venue.category = detailData.category || venue.category;
                                venue.address = detailData.address || venue.address;
                                venue.photos = detailData.photos || [];
                                venue.openingHours = detailData.opening_hours || '';
                                venue.detailedCategory = detailData.category_list || [];
                                venue.hasDetailedInfo = true;

                                // 验证位置准确性
                                if (detailData.location &&
                                    this.isValidLocation(detailData.location.lat, detailData.location.lng)) {
                                    venue.locationVerified = true;
                                }
                            }
                            resolveDetail(venue);
                        },
                        fail: () => {
                            resolveDetail(venue);
                        }
                    });
                });
            });

            Promise.all(detailPromises)
                .then(results => {
                    // 过滤掉位置不准确的结果
                    const verifiedResults = results.filter(venue =>
                        venue.locationVerified || this.isValidLocation(venue.location.lat, venue.location.lng));
                    resolve(verifiedResults);
                })
                .catch(error => {
                    console.error('获取场所详情失败:', error);
                    resolve(venues);
                });
        });
    },

    // 添加位置验证函数
    isValidLocation: function (lat, lng) {
        // 验证坐标是否在合理范围内
        return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
            lat !== 0 && lng !== 0; // 排除明显无效的坐标
    },

    // 添加距离计算辅助函数
    calculateDistance(lat1, lng1, lat2, lng2) {
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

    deg2rad(deg) {
        return deg * (Math.PI / 180);
    }
}); 