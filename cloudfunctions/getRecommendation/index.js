// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
    try {
        const { userLocation, partnerLocation, venueType } = event;

        // 计算中心点
        const centerLat = (userLocation.latitude + partnerLocation.latitude) / 2;
        const centerLng = (userLocation.longitude + partnerLocation.longitude) / 2;

        // 这里应该调用第三方地图服务API进行搜索
        // 由于云函数中可能需要特殊的配置来访问外部API
        // 这里使用模拟数据作为示例

        // 这里返回的是模拟数据
        const venues = [
            {
                id: 'venue1',
                title: '某某餐厅',
                address: '北京市朝阳区xxx街xxx号',
                tel: '010-12345678',
                category: '餐厅',
                type: venueType,
                distance: 500,
                location: {
                    lat: centerLat + 0.002,
                    lng: centerLng + 0.001
                }
            },
            {
                id: 'venue2',
                title: '某某咖啡',
                address: '北京市朝阳区xxx街yyy号',
                tel: '010-87654321',
                category: '咖啡厅',
                type: venueType,
                distance: 800,
                location: {
                    lat: centerLat - 0.001,
                    lng: centerLng + 0.002
                }
            },
            {
                id: 'venue3',
                title: '某某公园',
                address: '北京市朝阳区zzz街xxx号',
                tel: '',
                category: '公园',
                type: venueType,
                distance: 1200,
                location: {
                    lat: centerLat + 0.001,
                    lng: centerLng - 0.002
                }
            }
        ];

        return {
            success: true,
            data: venues
        };
    } catch (err) {
        return {
            success: false,
            errMsg: err.message
        };
    }
} 