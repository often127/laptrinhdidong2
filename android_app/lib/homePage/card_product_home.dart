import 'dart:html';

import 'package:flutter/material.dart';
import 'package:flutter_app/model/product.dart';
import 'package:flutter_app/network/network_request.dart';
import '../network/network_request.dart';


class ListViewPage extends StatefulWidget {
  @override
  _ListViewPageState createState() => _ListViewPageState();
}

class _ListViewPageState extends State<ListViewPage> {
  //
  List<Product> productData = [];

  @override
  void initState() {
    // TODO: implement initState
    super.initState();
    NetwortRequest.fetchProducts().then((dataProduct) => {
          setState(() {
            productData = dataProduct;
          })
        });
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      child: Column(
        children: [
          Expanded(
              child: ListView.builder(
                  padding: EdgeInsets.all(10),
                  itemCount: productData.length,
                  itemBuilder: (context, index) {
                    return Card(
                        child: Container(
                      color: Colors.white,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Image.network(
                            '${productData[index].picture}',
                            fit: BoxFit.fitWidth,
                            height: 250,
                            width: 400,
                          ),
                          Padding(
                            padding: const EdgeInsets.all(8.0),
                            child: Text(
                              '${productData[index].name}', ///////////// lỗi
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: Colors.black,
                                fontSize: 19,
                              ),
                            ),
                          ),
                          const SizedBox(
                            height: 12,
                          ),
                          Padding(
                            padding: const EdgeInsets.only(left: 8.0),
                            child: Text(
                              'Owner: ${productData[index].owner}',
                              style:
                                  TextStyle(color: Colors.black, fontSize: 15),
                            ),
                          ),
                          const SizedBox(
                            height: 12,
                          ),
                          SizedBox(
                            height: 10,
                          ),
                          Padding(
                            padding: const EdgeInsets.all(16.0),
                            child: Row(
                              children: <Widget>[
                                Expanded(
                                    flex: 1,
                                    child: RichText(
                                      text: TextSpan(
                                        children: [
                                          WidgetSpan(
                                            child: Icon(Icons.copy, size: 20),
                                          ),
                                          TextSpan(
                                              text: "Ox1...BBC",
                                              style: TextStyle(fontSize: 10)),
                                        ],
                                      ),
                                    )),
                                Expanded(
                                    flex: 1,
                                    child: RichText(
                                      textAlign: TextAlign.right,
                                      text: TextSpan(
                                        children: [
                                          WidgetSpan(
                                            child: Icon(
                                              Icons.price_check_rounded,
                                              size: 20,
                                              color: Colors.black,
                                            ),
                                          ),
                                          TextSpan(
                                              text:
                                                  '${productData[index].price}',
                                              style: TextStyle(fontSize: 12)),
                                        ],
                                      ),
                                    )),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ));
                  }))
        ],
      ),
    );
  }
}
