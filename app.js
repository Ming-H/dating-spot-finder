// app.js
App({
    globalData: {
        userLocation: null,
        partnerLocation: null,
        selectedVenueType: null,
        recommendedVenues: []
    },

    onLaunch() {
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
    }
}); 