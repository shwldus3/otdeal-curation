var express = require('express');
var db_curation = require('../db/db_curation');
var logger = require('./logger');
var async = require('async');
var HashMap = require('hashmap');
var dateutils = require('date-utils');

// 몽고디비 사용
var db = require('../db/db_config_mongo');
require('../db/clickModel');
var ClickModel = db.model('Click');

// 추천 알고리즘
exports.curationAlgorithm = function(callback){
	var user_id = '';
	var clickArr ='';
	var userIdArr = [];

	db_curation.findUserId(function(rows){
		// logger.debug('rows', rows);
		// logger.debug('rows[0].user_id', rows[0].user_id);
		// logger.debug('rows[1].user_id', rows[1].user_id);
		// logger.debug('rows.length', rows.length);

		var i = 0;
		async.whilst(
		    function () { return i < rows.length-1; },
		    function (callback) {
		        // logger.debug('rows[i].user_id', rows[i].user_id);
	        	userIdArr.push(rows[i].user_id);
	        	i++;
		        callback();
		        // setTimeout(callback, 1000);
		    },
		    function (err) {
		    	if(err) logger.error(err);
		    	// logger.debug('userIdArr', userIdArr);
		    }
		);

		// userIdArr.push("qwerty");
		// userIdArr.push("4MyIav");

		async.each(userIdArr, function(user_id, callback){
			// logger.debug('async userIdArr', userIdArr);
			// logger.info('user_id', user_id);
			// click된 item_id 각각을 받아온다.
			ClickModel.find({user_id:user_id},{_id:0,item_id:1,regtime:1}).exec(function(err, docs){
				// console.log("mongodb user_id", user_id);
				clickArr = docs;
				// console.log('clickArr뀨우우우', clickArr);
			}); // MongoDB

			// bsk, order, like된 item_id 각각을 받아온다.
			db_curation.findItemIdArr(user_id, function(dataArr){
				// logger.debug('user_id', user_id);
				// logger.debug('db_main에서 잘 받아오나 dataArr', dataArr);
				var bskArr = dataArr[0];
				var orderArr = dataArr[1];
				var likeArr = dataArr[2];
				// console.log('clickArr', clickArr);
				// console.log('bskArr', bskArr);
				// console.log('orderArr', orderArr);
				// console.log('likeArr', likeArr);

				// 시간가중치 적용
				async.series({
					clickArr: function(callback){
						// logger.debug('click');
						getTimeWeight(clickArr, callback);
					},
					bskArr: function(callback){
						// logger.debug('bsk');
						getTimeWeight(bskArr, callback);
					},
					orderArr: function(callback){
						// logger.debug('order');
						getTimeWeight(orderArr, callback);
					},
					likeArr: function(callback){
						// logger.debug('like');
						getTimeWeight(likeArr, callback);
					}
				}, function(err, result) {
			    	if(err) logger.error(err);
			    	// logger.debug('result_time', result);
			    	// callback(null, result);

			    	// 항목가중치 적용
			    	async.series({
			      		clickArr: function(callback){
			        		// logger.debug('click');
			    				getItemWeight(result.clickArr, 0.05, callback);
			      		},
			      		bskArr: function(callback){
		      				// logger.debug('bsk');
			      			getItemWeight(result.bskArr, 0.25, callback);
			      		},
			      		orderArr: function(callback){
			      			// logger.debug('order');
			      			getItemWeight(result.orderArr, 0.5, callback);
			      		},
			      		likeArr: function(callback){
			      			// logger.debug('like');
			      			getItemWeight(result.likeArr, 0.2, callback);
			      		}
				    }, function(err, result){
				    	if(err) logger.error(err);
				    	// console.log('result_item', result);
				    	// callback(null, result);

				    	var clickWeightArr = result.clickArr;
				    	var bskWeightArr = result.bskArr;
				    	var orderWeightArr = result.orderArr;
				    	var likeWeightArr = result.likeArr;

				    	var combineArr = [];

				    	// logger.debug('clickWeightArr', clickWeightArr);
				    	// logger.debug('bskWeightArr', bskWeightArr);
				    	// logger.debug('orderWeightArr', orderWeightArr);
				    	// logger.debug('likeWeightArr', likeWeightArr);

				    	async.series([
				    		function(callback){
				    			pushArr(clickWeightArr, combineArr, callback);
				    		},
				    		function(callback){
				    			pushArr(bskWeightArr, combineArr, callback);
				    		},
				    		function(callback){
				    			pushArr(orderWeightArr, combineArr, callback);
				    		},
				    		function(callback){
				    			pushArr(likeWeightArr, combineArr, callback);
				    		}
			    		], function(err, result){
			    			if(err) logger.error(err);
			    			// logger.debug('result_combineArr', result);
			    			// logger.debug('combineArr', combineArr);
			    			// callback(null, result);

			    			var map = new HashMap();

			    			async.each(combineArr, function(data, callback){
			    				var value = map.get(data[0]);
			    				if(value == null){
			    					map.set(data[0], data[1]);
			    				} else {
			    					map.set(data[0], (data[1]+value));
			    				}
			    				callback(null, map);
			    			}, function(err){
			    				if(err) logger.error(err);
			    				// console.log('map', map);
			    				// callback(null, map);

			    				var interestArr = [];

			    				map.forEach(function(value, key){
			    					var arr = new Array();
			    					arr.push(parseInt(key));
			    					arr.push(parseFloat((value).toFixed(3)));
			    					interestArr.push(arr);
			    				});

			    				console.log('interestArr', interestArr);
			    				// callback(null, interestArr);

									db_curation.getCurationInfo(interestArr, user_id, function(err){
										if(err) logger.error(err);
										// console.log('interestArr', interestArr);
										// console.log('user_id', user_id);
										// console.log('result', result);
										callback(null);
										// var inputArr = ['end','success',' '];
										// db_curation.saveBatchInfo(function(inputArr, row){
										// 	var success = false;
										// 	if(row.affectedRows == 1){
										// 		success = true;
										// 	}
										// 	conn.release();
										// 	callback(success);
										// });
									});
			    			}); // async.each(combineArr, function(data, callback)
		    			}); // interestArr에 push series
			    	}); // 항목가중치 series
				}); // 시간가중치 series
			}); // db_curation.findItemIdArr


		}, function(err){
			if(err) logger.error(err);
			callback(err);
		});
	}); // db_curation.findUserId
};




// 시간가중치 얻는 함수
function getTimeWeight(dataArr, callback){
	// logger.debug('dataArr', dataArr);
	var timeWeightArr = [];
	async.each(dataArr, function(data, callback){
		var dayDiff = (data.regtime).getDaysBetween(Date.today());

		if(dayDiff > 1){
			var log = Math.log(dayDiff) / Math.LN10;
		} else if(dayDiff = 1) {
			var log = 0.23
		} else if(dayDiff = 0) {
			var log = 0.30
		}
		var itemArr = new Array();
		itemArr[0] = data.item_id;
		itemArr[1] = 1 / log;
		timeWeightArr.push(itemArr);
		// logger.debug('dayDiff', dayDiff);
		// logger.debug('log', log);
		console.log('dayDiff', dayDiff);
		console.log('log', log);
		console.log('timeWeightArr', timeWeightArr);

		callback(null, timeWeightArr);
	}, function(err){
		if(err) logger.error(err);
		// logger.debug('timeWeightArr', timeWeightArr);
		callback(null, timeWeightArr);
	});
}


// 항목 가중치 얻는 함수
function getItemWeight(dataArr, itemweight, callback){
	async.each(dataArr, function(data, callback){
		data[1] = (data[1]*itemweight).toFixed(3);
		// logger.debug('data',data);
		// logger.debug('dataArr', dataArr);
		callback(null, dataArr);
	}, function(err){
		if(err) logger.error(err);
		callback(null, dataArr);
	});
}

// clickArr, bskArr, orderArr, likeArr를
// combineArr에 push해서 하나로 만든다.
function pushArr(dataArr, combineArr, callback){
	async.each(dataArr, function(data, callback){
		// logger.debug('data', data);
		data[1] = parseFloat(data[1]);
		combineArr.push(data);
		// logger.debug('combineArr', combineArr);
		callback(null, combineArr);
	}, function(err){
		if(err) logger.error(err);
		callback(null, combineArr);
	});
}