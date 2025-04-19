// pages/index/index.js
const app = getApp();
// 更换为高德地图SDK
const AMapWX = require('../../utils/amap-wx.js');

let amapWx;
let apiCallTimestamp = 0;
const API_CALL_INTERVAL = 5000; // 限制API调用间隔至少5秒

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
        devForceRefresh: false
    },

    onLoad() {
        try {
            // 初始化高德地图SDK
            amapWx = new AMapWX({
                key: '您的高德地图API密钥' // 请替换为您申请的高德地图API密钥
            });

            console.log('地图SDK初始化完成，API密钥:', amapWx.key);
        } catch (e) {
            console.error('地图SDK初始化失败:', e);
            wx.showModal({
                title: '初始化失败',
                content: '地图服务初始化失败，请重启小程序',
                showCancel: false
            });
            return;
        }

        // 检查SDK是否正确加载
        if (!amapWx || typeof amapWx.getPoiAround !== 'function') {
            console.error('地图SDK实例异常，缺少必要方法');
            wx.showModal({
                title: '加载异常',
                content: '地图服务加载异常，请重启小程序',
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

    // 更新地图标记
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

        // 添加推荐场所标记
        this.data.recommendedVenues.forEach((venue, index) => {
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
                iconPath: '/images/marker-venue.svg'
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

    // 寻找约会场所 - 使用高德地图SDK
    findVenues() {
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

        this.setData({ loading: true });

        try {
            // 计算中心点
            const centerLat = (this.data.userLocation.latitude + this.data.partnerLocation.latitude) / 2;
            const centerLng = (this.data.userLocation.longitude + this.data.partnerLocation.longitude) / 2;

            // 根据场所类型映射关键词
            const typeKeywords = {
                'restaurant': '餐厅',
                'cafe': '咖啡厅',
                'movie': '电影院',
                'park': '公园',
                'shopping': '商场',
                'bar': '酒吧'
            };

            const keyword = typeKeywords[this.data.selectedVenueType];
            const cacheKey = `venues_${keyword}_${centerLat.toFixed(3)}_${centerLng.toFixed(3)}`;

            // 检查本地缓存
            const cachedResults = wx.getStorageSync(cacheKey);
            const now = Date.now();

            // 如果有缓存且缓存未过期（24小时内）且不是开发模式强制刷新
            if (cachedResults && now - cachedResults.timestamp < 24 * 60 * 60 * 1000 && !this.data.devForceRefresh) {
                console.log('使用缓存的场所数据');
                this.processAmapVenueResults(cachedResults.data);
                return;
            }

            // 检查API调用频率限制
            if (now - apiCallTimestamp < API_CALL_INTERVAL) {
                console.log('API调用过于频繁，使用备用数据');
                this.useBackupVenueData();
                wx.showToast({
                    title: 'API调用过于频繁，已使用备选数据',
                    icon: 'none',
                    duration: 2000
                });
                return;
            }

            // 更新最后API调用时间
            apiCallTimestamp = now;

            console.log('开始搜索场所:', {
                keyword,
                location: `${centerLat},${centerLng}`
            });

            // 调用高德地图周边搜索API
            amapWx.getPoiAround({
                querykeywords: keyword,
                location: `${centerLng},${centerLat}`, // 注意：高德地图是经度在前，纬度在后
                success: (res) => {
                    console.log('搜索结果成功:', res);
                    if (res && res.markers && Array.isArray(res.markers)) {
                        // 保存到缓存
                        wx.setStorageSync(cacheKey, {
                            timestamp: now,
                            data: res.markers
                        });

                        this.processAmapVenueResults(res.markers);
                    } else {
                        console.error('搜索结果格式异常:', res);
                        this.handleSearchError('搜索结果异常');
                    }
                },
                fail: (error) => {
                    console.error('搜索场所失败:', error);

                    // 处理API调用失败
                    this.handleSearchError(error);
                },
                complete: () => {
                    // 确保无论成功或失败都关闭加载状态
                    if (this.data.loading) {
                        this.setData({ loading: false });
                    }
                }
            });
        } catch (error) {
            console.error('搜索过程发生异常:', error);
            this.handleSearchError('执行搜索时发生异常');
        }
    },

    // 添加新方法：处理高德地图场所结果数据
    processAmapVenueResults(venueData) {
        const venues = venueData.map((item, index) => ({
            id: index.toString(),
            title: item.name,
            address: item.address || '',
            tel: item.tel || '',
            category: item.type || this.data.selectedVenueType,
            type: this.data.selectedVenueType,
            distance: item.distance || 0,
            location: {
                lat: parseFloat(item.latitude),
                lng: parseFloat(item.longitude)
            }
        }));

        app.globalData.recommendedVenues = venues;

        this.setData({
            recommendedVenues: venues,
            showVenueList: true,
            loading: false
        });

        this.updateMarkers();
    },

    // 新增：处理搜索错误的统一方法
    handleSearchError(error) {
        let errorMsg = '搜索场所失败';
        let suggestedAction = '';

        // 根据错误类型显示不同提示
        if (typeof error === 'string') {
            errorMsg = error;
        } else if (error && error.status) {
            // 处理常见错误码
            if (error.status === 121) {
                errorMsg = 'API密钥无效或未授权';
                suggestedAction = '请检查高德地图开发者平台中API密钥的状态，确认已授权该小程序AppID';
            } else if (error.status === 348) {
                errorMsg = '请求超出配额限制';
                suggestedAction = '当日API调用次数已达上限，请明天再试或升级服务';
            } else if (error.status === 311) {
                errorMsg = '请求的服务接口或域名未获授权';
                suggestedAction = '请在微信小程序管理后台添加高德地图API域名到request合法域名列表';
            }
        }

        // 降级处理：如果API调用失败，使用模拟数据
        if (error && (error.status === 121 || error.status === 348 || error.status === 311)) {
            this.useBackupVenueData();
        } else {
            wx.showModal({
                title: '搜索失败',
                content: errorMsg + (suggestedAction ? '\n\n' + suggestedAction : ''),
                showCancel: false
            });

            this.setData({ loading: false });
        }
    },

    // 新增：当API调用失败时使用备用数据
    useBackupVenueData() {
        console.log('使用备用数据...');

        // 计算中心点
        const centerLat = (this.data.userLocation.latitude + this.data.partnerLocation.latitude) / 2;
        const centerLng = (this.data.userLocation.longitude + this.data.partnerLocation.longitude) / 2;

        // 备用数据 - 根据所选类型显示一些模拟数据
        const typeLabels = {
            'restaurant': '餐厅',
            'cafe': '咖啡厅',
            'movie': '电影院',
            'park': '公园',
            'shopping': '购物中心',
            'bar': '酒吧'
        };

        const venueType = this.data.selectedVenueType;
        const typeLabel = typeLabels[venueType] || '场所';

        // 创建一些模拟数据，基于当前中心位置偏移
        const venues = [
            {
                id: 'backup1',
                title: `推荐${typeLabel}1`,
                address: '北京市朝阳区',
                tel: '010-12345678',
                category: venueType,
                type: venueType,
                distance: 800,
                location: {
                    lat: centerLat + 0.005,
                    lng: centerLng + 0.005
                }
            },
            {
                id: 'backup2',
                title: `推荐${typeLabel}2`,
                address: '北京市海淀区',
                tel: '010-87654321',
                category: venueType,
                type: venueType,
                distance: 1200,
                location: {
                    lat: centerLat - 0.003,
                    lng: centerLng + 0.002
                }
            },
            {
                id: 'backup3',
                title: `热门${typeLabel}`,
                address: '北京市东城区',
                tel: '010-55557777',
                category: venueType,
                type: venueType,
                distance: 1500,
                location: {
                    lat: centerLat - 0.006,
                    lng: centerLng - 0.004
                }
            }
        ];

        app.globalData.recommendedVenues = venues;

        this.setData({
            recommendedVenues: venues,
            showVenueList: true,
            loading: false
        });

        this.updateMarkers();

        wx.showToast({
            title: 'API调用受限，已显示备选数据',
            icon: 'none',
            duration: 2000
        });
    },

    // 绘制路线 - 使用高德地图SDK
    drawRouteLine() {
        const from = {
            latitude: this.data.userLocation.latitude,
            longitude: this.data.userLocation.longitude
        };

        const to = {
            latitude: this.data.partnerLocation.latitude,
            longitude: this.data.partnerLocation.longitude
        };

        amapWx.getDrivingRoute({
            origin: `${from.longitude},${from.latitude}`, // 注意：高德地图是经度在前，纬度在后
            destination: `${to.longitude},${to.latitude}`,
            success: (res) => {
                console.log('路线规划成功:', res);
                // 处理路线数据
                if (res.paths && res.paths.length > 0) {
                    const path = res.paths[0];

                    // 提取路线点数据
                    let points = [];
                    if (path.steps) {
                        path.steps.forEach(step => {
                            if (step.polyline) {
                                const polylinePoints = step.polyline.split(';');
                                polylinePoints.forEach(point => {
                                    const [lng, lat] = point.split(',');
                                    points.push({
                                        longitude: parseFloat(lng),
                                        latitude: parseFloat(lat)
                                    });
                                });
                            }
                        });
                    }

                    // 设置路线数据
                    this.setData({
                        polylines: [{
                            points: points,
                            color: '#FF6B81',
                            width: 4,
                            dottedLine: false
                        }]
                    });
                }
            },
            fail: (error) => {
                console.error('路线规划失败:', error);
                // 生成简单直线路径作为备选
                this.generateFallbackRoute(from, to);
            }
        });
    },

    // 添加生成备选路线方法
    generateFallbackRoute(from, to) {
        console.log('生成备用路线...');
        const points = [
            { latitude: from.latitude, longitude: from.longitude },
            { latitude: to.latitude, longitude: to.longitude }
        ];

        this.setData({
            polylines: [{
                points: points,
                color: '#FF6B81',
                width: 4,
                dottedLine: true
            }]
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

    // 使用高德地图SDK搜索位置
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

        // 使用高德地图SDK搜索POI
        amapWx.getInputtips({
            keywords: keyword,
            location: '',
            success: function (data) {
                wx.hideLoading();
                if (data && data.tips) {
                    let markers = [];
                    let searchResults = [];

                    data.tips.forEach((item, index) => {
                        if (item.location) {
                            let location = item.location.split(',');
                            let marker = {
                                id: index,
                                latitude: location[1],
                                longitude: location[0],
                                title: item.name,
                                callout: {
                                    content: item.name,
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
                                name: item.name,
                                address: item.address || item.district,
                                latitude: location[1],
                                longitude: location[0]
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
    }
}); 