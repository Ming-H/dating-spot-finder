// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
    try {
        const wxContext = cloud.getWXContext()
        const openid = wxContext.OPENID

        const { venue, action } = event

        // 收藏场所
        if (action === 'add') {
            // 查询是否已经存在该场所
            const checkResult = await db.collection('userFavorites').where({
                openid: openid,
                'venue.id': venue.id
            }).get()

            // 如果不存在，则添加
            if (checkResult.data.length === 0) {
                return await db.collection('userFavorites').add({
                    data: {
                        openid: openid,
                        venue: venue,
                        createTime: db.serverDate()
                    }
                })
            } else {
                return {
                    success: true,
                    message: '场所已收藏'
                }
            }
        }
        // 取消收藏
        else if (action === 'remove') {
            return await db.collection('userFavorites').where({
                openid: openid,
                'venue.id': venue.id
            }).remove()
        }
        // 获取收藏列表
        else if (action === 'list') {
            return await db.collection('userFavorites').where({
                openid: openid
            }).get()
        }

        return {
            success: false,
            message: '未知操作'
        }
    } catch (err) {
        return {
            success: false,
            errMsg: err.message
        }
    }
} 