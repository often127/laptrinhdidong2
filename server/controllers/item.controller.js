const { Item, Order } = require('../models')
require('dotenv').config({ path: '../.env' })

const ItemManagerContractJSON = require('../contracts/ItemManager.json')
const OrderContractJSON = require('../contracts/Order.json')
const ItemContractJSON = require('../contracts/Item.json')
const Web3 = require('web3')
var web3 = new Web3(new Web3.providers.WebsocketProvider(process.env.INFURA_WS_ENDPOINT))
// reconnect web socket
setInterval( () => web3 = new Web3(new Web3.providers.WebsocketProvider(process.env.INFURA_WS_ENDPOINT)), 3600000)

console.log(`Listening Infura Websocket provider: ${process.env.INFURA_WS_ENDPOINT}`)
var ItemManagerContract

// listenning Item manager contract event
(async () => {
    ItemManagerContract = await new web3.eth.Contract(
        ItemManagerContractJSON.abi,
        process.env.ITEM_MANAGER_ADDRESS
    )
    console.log(`Item manager Smart contract address: ${process.env.ITEM_MANAGER_ADDRESS}`)
    
    // call every 20 minutes to keep web socket alive
    setInterval( () => ItemManagerContract.methods.currentItemIndex().call(), 1200000)

    ItemManagerContract.events.ItemStateChanged().on('data', async event => {
        const lastItemIndex = await ItemManagerContract.methods.currentItemIndex().call()
        //  Item created
        console.log(event.returnValues.state)
        if (event.returnValues.state == '0' && event.returnValues.itemIndex == (lastItemIndex - 1)) {
            // wait for node fully synced
            await new Promise(resolve => setTimeout(resolve, 5000))

            ItemManagerContract.methods.items(event.returnValues.itemIndex).call()
                .then(sItemStruct => new web3.eth.Contract(ItemContractJSON.abi, sItemStruct._item))
                .then(ItemContractInstance => ItemContractInstance.methods.rawDataHash().call()
                    .then(rawDataHash => {
                        //  add item to database include raw data hash
                        Item.findOne({ rawDataHash: rawDataHash }).then(itemhiden => {
                            const newItem = new Item({
                                _id: ItemContractInstance._address,
                                name: itemhiden.name,
                                price: itemhiden.price,
                                owner: itemhiden.owner.toLowerCase(),
                                description: itemhiden.description,
                                specifications: itemhiden.specifications,
                                externalLink: itemhiden.externalLink,
                                rawDataHash: rawDataHash,
                                picture: itemhiden.picture,
                                state: 0
                            })
                            newItem.save()
                            console.log("New Item: " + ItemContractInstance._address)
                        }).then(() => {
                            // delete old item data
                            Item.findOneAndDelete({ rawDataHash: rawDataHash })
                                .exec(error => {
                                    if (error) {
                                        console.log(error)
                                    }
                                })
                        })
                    })
                ).catch(error => console.log(error))
        }

        // listen Item sold event
        else if (event.returnValues.state == '1') {
            ItemManagerContract.methods.items(event.returnValues.itemIndex).call().then(sItemStruct => {
                // change item state and hide item
                Item.findByIdAndUpdate(sItemStruct._item, {
                    order: sItemStruct._order,
                    state: 1
                }).exec(error => {
                    if (error) {
                        console.log(error)
                    } else {
                        (async () => {
                            // wait for node fully synced
                            await new Promise(resolve => setTimeout(resolve, 5000))
                            // save order object in the database
                            const OrderContract = await new web3.eth.Contract(OrderContractJSON.abi, sItemStruct._order)
                            const newOrder = new Order({
                                _id: OrderContract._address,
                                price: await OrderContract.methods.getBalance().call(),
                                seller: (await OrderContract.methods.seller().call()).toLowerCase(),
                                deadline: await OrderContract.methods.getDeadline().call(),
                                itemContract: await OrderContract.methods.itemContract().call(),
                                purchaser: (await OrderContract.methods.purchaser().call()).toLowerCase(),
                            })
                            newOrder.save().catch(err => console.log(err))
                            console.log("Order: " + OrderContract._address)
                        })()
                    }
                })
            })
        }

        // listen Item delivered event
        else if (event.returnValues.state == '2') {
            ItemManagerContract.methods.items(event.returnValues.itemIndex).call().then(sItemStruct => {
                (async () => {
                    // wait for node fully synced
                    await new Promise(resolve => setTimeout(resolve, 5000))
                    // change ownership and show item
                    console.log("Delivered item: " + sItemStruct._item)
                    const OrderContract = await new web3.eth.Contract(OrderContractJSON.abi, sItemStruct._order)
                    Item.findByIdAndUpdate(await OrderContract.methods.itemContract().call(), {
                        owner: (await OrderContract.methods.purchaser().call()).toLowerCase(),
                        state: 2
                    }).exec(error => {
                        if (error) console.log(error)
                    })
                })()
            })
        }

        // listen Item cancel event
        else if (event.returnValues.state == '3') {
            ItemManagerContract.methods.items(event.returnValues.itemIndex).call().then(sItemStruct => {
                (async () => {
                    Item.findByIdAndUpdate(sItemStruct._item, {
                        state: 3
                    }).exec(error => {
                        if (error) console.log(error)
                    })
                })()
            })
        }
    })
})()

const multer = require('multer')

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './public/pictures/items/')
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, uniqueSuffix + file.originalname)
    }
})

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype == "image/png" || file.mimetype == "image/jpg" || file.mimetype == "image/jpeg") {
            cb(null, true)
        } else {
            cb(null, false)
            return cb(new Error('Only .png, .jpg and .jpeg format allowed!'))
        }
    },
    limits: {
        fileSize: 4 * 1024 * 1024,
    }
}).single('file')

const getRawItem = (req, res) => {
    Item.findById(req.params.address)
        .select('-_id name description specifications externalLink picture')
        .then(item => res.status(200).json(item))
        .catch(error => res.status(404).json(error))
}

const getItems = (req, res) => {
    Item
        .find({ state: 0 })
        .sort('-createdAt')
        .select('name picture price owner')
        .limit(12)
        .then(items => res.status(200).json(items))
}

const getMyItems = (req, res) => {
    Item
        .find({ owner: req.query._id })
        .where({ state: { $ne: 4 } })
        .sort('-createdAt')
        .select('name picture price owner')
        .limit(12)
        .then(items => res.status(200).json(items))
}

const getPurchaseOrder = (req, res) => {
    Order
        .find({ purchaser: req.query._id })
        .sort('-createdAt')
        .limit(12)
        .populate('itemContract', '_id name picture price owner')
        .then(items => res.status(200).json(items))
}

const getSalesOrder = (req, res) => {
    Order
        .find({ seller: req.query._id })
        .sort('-createdAt')
        .limit(12)
        .populate('itemContract', '_id name picture price owner')
        .then(items => res.status(200).json(items))
}


const getItem = (req, res) => {
    Item
        .findById(req.query._id)
        .then(item => res.status(200).json(item))
        .catch(error => res.status(404).json(error))
}

const searchItem = (req, res) => {
    Item
        .find(({ name: { $regex: req.query.keywords, $options: 'i' } }))
        .sort('-createdAt')
        .limit(12)
        .then(items => {
            res.status(200).json(items)
        })
}

const createItem = (req, res) => {
    upload(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            console.log('A Multer error occurred when uploading.')
            res.status(500).json({ error: 'A Multer error occurred when uploading.' })
        } else if (err) {
            console.log('An unknown error occurred when uploading: ' + err)
            res.status(500).json({ error: 'An unknown error occurred when uploading: ' + err })
        }
        req.body.picture = `http://${process.env.ADDRESS}/pictures/items/${req.file.filename}`
        req.body._id = req.file.filename.substring(0, 41)
        const newItem = new Item(req.body)
        newItem
            .save()
            .then(item => {
                // return soliditySha3 data
                Item
                    .findById(item._id)
                    .select('-_id name description specifications externalLink picture')
                    .then(itemRawData => web3.utils.soliditySha3(itemRawData))
                    .then(rawDataHash => {
                        Item
                            .findByIdAndUpdate(item._id, {
                                rawDataHash: rawDataHash
                            }).exec(error => error ? res.status(500).json(error) : res.status(201).json(rawDataHash))
                    })
                    .catch(error => {
                        console.log(error)
                        res.status(500).json({ error: error })
                    })
            })
            .catch(error => {
                console.log(error)
                res.status(500).json({ error: error })
            })
    })
}

const updateOrder = async (req, res) => {
    const OrderContract = await new web3.eth.Contract(OrderContractJSON.abi, req.body._id)
    const orderState = await OrderContract.methods.state().call()
    const orderDealine = await OrderContract.methods.getDeadline().call()
    Order
        .findByIdAndUpdate(req.body._id, {
            state: orderState,
            deadline: orderDealine
        })
        .exec(err => err ? res.status(500).json(err) : res.status(201).json({ state: orderState, deadline: orderDealine }))
}

const changePrice = async (req, res) => {
    const ItemContract = await new web3.eth.Contract(
        ItemContractJSON.abi,
        req.body._id
    )
    const ItemPrice = await ItemContract.methods.price().call()
    Item
        .findByIdAndUpdate(req.body._id, { price: ItemPrice })
        .exec(err => err ? res.status(500).json(err) : res.status(201).json(ItemPrice))
}

const delivery = (req, res) => {
    Order
        .findById(req.body.id)
        .select('nowIn')
        .then(orderNowIn => {
            if (orderNowIn.nowIn === 'Nowhere') {
                Order
                    .findByIdAndUpdate(req.body.id, {
                        from: req.body.nowIn,
                        nowIn: req.body.nowIn
                    })
                    .exec(err =>
                        err ? res.status(500).json(err) : Order.findById(req.body.id).select('nowIn from to').then(order => res.status(201).json(order))
                    )
            } else {
                Order
                    .findByIdAndUpdate(req.body.id, {
                        nowIn: req.body.nowIn,
                    })
                    .exec(err =>
                        err ? res.status(500).json(err) : Order.findById(req.body.id).select('nowIn from to').then(order => res.status(201).json(order))
                    )
            }
        })
}

const setDeliveryTo = async (req, res) => {
    Order
        .findByIdAndUpdate(req.body.id, {
            to: req.body.to,
        })
        .exec(err =>
            err ? res.status(500).json(err) : Order.findById(req.body.id).select('nowIn from to').then(order => res.status(201).json(order))
        )
}


module.exports = {
    getRawItem,
    getItem,
    getItems,
    getMyItems,
    getPurchaseOrder,
    getSalesOrder,
    createItem,
    updateOrder,
    searchItem,
    changePrice,
    delivery,
    setDeliveryTo
}