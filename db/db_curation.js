var mysql = require('mysql');
var db_config = require('./db_config');
var pool = mysql.createPool(db_config);
var async = require('async');
var logger = require('../batchjob/logger.js');


exports.findUserId = function(callback){
	pool.getConnection(function(err, conn){
		if(err) logger.error(err);
		var sql = 'select user_id from TBUSR';

		conn.query(sql, [], function(err, rows){
			if(err) logger.error(err);
			// console.log('rows', rows);
			conn.release();
			callback(rows);
		});
	});
};

exports.findItemIdArr = function(user_id, callback){
	pool.getConnection(function(err, conn){
		async.series([
			function(callback){
				findbskArr(user_id, callback);
		    },
		    function(callback){
		    	findorderArr(user_id, callback);
		    },
		    function(callback){
		    	findlikeArr(user_id, callback);
		    }
		], function(err, result){
			if(err) logger.error(err);
			// console.log('result', result);
			conn.release();
			callback(result);
		});

		function findbskArr(user_id, callback){
			// console.log('user_id', user_id);
			if(err) logger.error(err);
			var sql = 'select if(itm.item_grcd=0 and itm.item_grid is not NULL, itm.item_grid, bsk.item_id) as item_id, bsk.bsk_regtime as regtime from TBBSK bsk, TBITM itm where bsk.user_id = ? and itm.item_id = bsk.item_id';
			conn.query(sql, user_id, function(err, rows){
				if(err) logger.error(err);
				// console.log('rows', rows);
				// conn.release();
				callback(null, rows);
			});
		}

		function findorderArr(user_id, callback){
			// console.log('user_id', user_id);
			if(err) logger.error(err);
			var sql = 'select if(itm.item_grcd=0 and itm.item_grid is not NULL, itm.item_grid, odritm.item_id) as item_id, odr.order_regtime as regtime from TBODR odr, TBODRITM odritm, TBITM itm where user_id = ? and odritm.order_id = odr.order_id and itm.item_id = odritm.item_id';
			conn.query(sql, user_id, function(err, rows){
				if(err) logger.error(err);
				// console.log('rows', rows);
				// conn.release();
				callback(null, rows);
			});
		}

		function findlikeArr(user_id, callback){
			// console.log('user_id', user_id);
			if(err) logger.error(err);
			var sql = 'select item_id, like_regtime as regtime from TBLK where user_id = ?';
			conn.query(sql, user_id, function(err, rows){
				if(err) logger.error(err);
				// console.log('rows', rows);
				// conn.release();
				callback(null, rows);
			});
		}

	});
};


/**
 * 배치 정보 저장
 * @param  {Function} callback [성공여부]
 * @return {[type]}
 */
exports.saveBatchInfo = function(inputArr, callback){
	pool.getConnection(function (err, conn) {
		if(err) logger.error(err);
		var sql = "insert into TBBATCH (batch_process, batch_result, batch_err_content, batch_date) values(?,?,?,now())";
		conn.query(sql, inputArr, function(err, row) { //related_rows = 스타일 연관 있는 아이템 정보
			if (err) logger.error(err);
			var success = false;
			if(row.affectedRows == 1){
				success = true;
			}
			conn.release();
			callback(success);
		});
	});
};


/**
 * Clustering, Euclidean, DB 처리과정
 * @param  {[type]}   interestArr [description]
 * @param  {Function} callback  [description]
 * @return {[type]}             [description]
 */
exports.getCurationInfo = function(interestArr, user_id, callback){
	pool.getConnection(function (err, conn) {
		if(err) logger.error(err);
		logger.debug('interestArr', interestArr);
		// logger.debug('user_id', user_id);

		async.waterfall([
			function(callback){
				//해당 사용자의 추천정보 초기화
				deleteUserCurationInfo(user_id, conn, callback);
			},
			function(err, callback){
				// logger.debug('0) 에러만 없으면  	Clustering, Euclidean, DB 처리 - ' + err);
				getStyleCluster(user_id, interestArr, conn, callback);
			}
		],
		function(err){
			if(err) logger.error(err);
			conn.release();
			callback(null);
		});
	});


	/*
		사용자의 추천정보 초기화
	 */
	function deleteUserCurationInfo(user_id, conn, callback){
		var sql = "delete from TBCRT where user_id = ?";
		conn.query(sql, [user_id], function(err, row) {
			if (err) logger.error(err);
			// logger.debug('0) 사용자의 추천정보 초기화 - ' + user_id);
			var result = false;
			if(row.affectedRows == 1){
				result = true;
			}
			// logger.debug('0) result - ' + result);
			callback(null, err);
		});
	}


	/*
		1) 스타일 클러스터링 - DB select : 조건(A스타일 : 최소1개 이상 필수, B스타일 : 1개 필수)
		2) 관심 아이템 정보추출
		3) 관심-연관 size 클러스터링
		4) 관심-연관 Euclidean 계산
		5) DB Insert
	 */
	function getStyleCluster(user_id, interest_rows, conn, callback){

		async.each(interest_rows, function(interest_row, callback){
			//1) 스타일 클러스터링
			var sql = "select A.item_id, count(A.item_id) as sty_cnt, A.item_name, A.size_name, A.item_saleprice, A.item_grcd from (select itm1.item_id, itm1.item_name, itm1.item_price, itm1.item_saleprice, sty1.sty_cd, itm1.size_name, itm1.item_grid, itm1.item_grcd from TBITM itm1, TBSTYI sty1 where sty1.sty_cd IN (select si1.sty_cd from TBSTYI si1, TBSTY sty1 where si1.item_id=? and sty1.sty_gubun='A' and si1.sty_cd = sty1.sty_cd) and itm1.item_id = sty1.item_id) as A, (select itm2.item_id, itm2.item_name, sty2.sty_cd, itm2.size_name, itm2.item_grid, itm2.item_grcd from TBITM itm2, TBSTYI sty2 where sty2.sty_cd IN (select si2.sty_cd from TBSTYI si2, TBSTY sty2 where si2.item_id=? and sty2.sty_gubun='B' and si2.sty_cd = sty2.sty_cd) and itm2.item_id = sty2.item_id) as B where A.item_id = B.item_id group by item_id";
			conn.query(sql, [interest_row[0], interest_row[0]], function(err, related_rows) { //related_rows = 스타일 연관 있는 아이템 정보
				if (err) logger.error(err);
				// logger.debug('1) Style 클러스터링 - ' + interest_row[0]);
				// if(related_rows[0]) logger.debug('1) related_rows: ' + 'Y');
				// else logger.debug('1) related_rows: ' + 'N');
				if(related_rows[0]){
					// (2) ~ (5)
					setEucliAfterSzCluster(user_id, interest_row, related_rows, conn, function(err){
						if(err) logger.error(err);
						callback(null);
					});
				}else{
					callback(null);
				}
			});
			// callback(null);
		}, function(err){
			if(err) logger.error(err);
			callback(null);//에러가 없으면 null, 있으면 정보 담김
		});//end_ayncEach
	}//end_getStyleCluster(function)


	/*
		2)관심 아이템 정보추출 -> 3)관심-연관 size 클러스터링 -> 4)관심-연관 Euclidean 계산 -> 5)관심도-연관도 거리 계산 -> 6)DB Insert
	 */
	function setEucliAfterSzCluster(user_id, interest_row, related_rows, conn, callback){
		var interest_item_id = interest_row[0];
		var interest_weight = interest_row[1];

		async.waterfall([
			function(callback){
				// 2) 관심 아이템 정보추출
				var sql = "select itm.item_id, count(itm.item_id) as sty_cnt , itm.item_saleprice, itm.size_name from TBITM itm, TBSTYI si, TBSTY sty where itm.item_id=si.item_id and itm.item_id=? and sty.sty_cd = si.sty_cd and sty.sty_gubun='A' group by itm.item_id";//필요한 정보 : 가격, 사이즈
				conn.query(sql, interest_item_id, function(err, interest_info_row) {//interest_info = 관심아이템 정보
					if (err) logger.error(err);
					// logger.debug('2) 관심 아이템 정보추출 - ' + interest_item_id);
					// logger.debug('2) interest_info: ', interest_info_row[0].item_id, interest_info_row[0].sty_cnt, interest_info_row[0].item_saleprice, interest_info_row[0].size_name);
					callback(null, interest_info_row[0]);
				});
			},
			function(interest_info, callback){
				async.each(related_rows, function(related_row, callback){
					if(related_row.item_id != interest_info.item_id){
						// 3)관심-연관 size 클러스터링
						if(sizeFiltering(interest_info.size_name, related_row.size_name)){

							// 4)관심-연관 Euclidean 계산
							var euclidean_score = calculateEucli(parseInt(interest_info.item_saleprice)/1000, parseInt(interest_info.sty_cnt), parseInt(related_row.item_saleprice)/1000, parseInt(related_row.sty_cnt));//Euclidean 연관도
							// logger.debug('4) interest_weight(관심도): ' + interest_weight);
							// logger.debug('4) euclidean_score(연관도): ' + euclidean_score);
							// logger.debug('관심 아이템: ' + interest_info.item_id);
							// logger.debug('연관 아이템: ' + related_row.item_id);

							// 5) 관심도-연관도 거리 계산
							var total_score = calculateDistance(interest_weight, euclidean_score);
							// logger.debug('5) total_score(관심도-연관도 거리 계산): ' + total_score);

							// 6) DB Select - Insert (중복 아이템은 비교하여 높은 점수로 저장)
							// setItemScore(user_id, related_row.item_id, total_score, function(err){
							// 	if(err) logger.error(err);
							// });
							var item_id = related_row.item_id;
							sql = "insert into TBCRT (user_id, item_id, interest_id, score, euclidean_score, interest_weight, crt_regdate) values(?, ?, ?, ?, ?, ?, now())";
							conn.query(sql, [user_id, item_id, interest_info.item_id, total_score, euclidean_score, interest_weight], function(err, row) {
								if (err){
									logger.debug('6-1) 이미 존재하는 데이터');
								}else{
									logger.debug('6-1) DB Insert into TBCRT');
									// logger.debug('6-1) user_id: ' + user_id + ', item_id: ' + item_id + ', total_score: ' + total_score);
									// logger.debug('6-1) result (1이면 정상): ' + row.affectedRows);
								}
								callback(null);
							});
						}else{
							callback(null);
						}//end_if
					}else{
						callback(null);
					}//end_if
				}, function(err){
					if(err) logger.error(err);
					callback(null);
				});//end_asyncEach
			}
		],
		function(err){
			if(err) logger.error(err);
			callback(null);
		});//end_asyncWaterfall


		/*
			6) DB Delete - Select - Insert (중복 아이템은 비교하여 높은 점수로 저장)
		 */
		function setItemScore(user_id, item_id, total_score, callback){
			async.waterfall([
				function(success, callback){
					var exist_score;
					sql = "select score from TBCRT where user_id =? and item_id = ? order by score asc";
					conn.query(sql, [user_id, item_id], function(err, row) {
						if (err) logger.error(err);
						if(row[0]){
							exist_score = row[0].score;
						}
						logger.debug('6-1) DB Select from TBCRT');
						// logger.debug('6-1) user_id: ' + user_id + ', item_id: ' + item_id + ', score: ' + exist_score);
						callback(null, exist_score);
					});
				},
				function(exist_score, callback){
					if(exist_score){
						console.log(exist_score);
						if(Number(exist_score) > Number(total_score)){
							// 기존 점수보다 새로운 점수가 작으면 새로 업데이트
							sql = "update TBCRT set score=? where user_id=? and item_id=?";
							conn.query(sql, [total_score, user_id, item_id], function(err, row) {
								if (err) logger.error(err);
								logger.debug('6-2) DB Update TBCRT set');
								// logger.debug('6-2) score: ' + total_score + ', user_id: ' + user_id + ', item_id: ' + item_id);
								// logger.debug('6-2) result (1이면 정상): ' + row.affectedRows);
							});
						}
					}else{
						sql = "insert into TBCRT (user_id, item_id, score, crt_regdate) values(?, ?, ?, now())";
						conn.query(sql, [user_id, item_id, total_score], function(err, row) {
							if (err){
								logger.debug('6-3) 이미 존재하는 데이터');
							}else{
								logger.debug('6-3) DB Insert into TBCRT');
								// logger.debug('6-3) user_id: ' + user_id + ', item_id: ' + item_id + ', total_score: ' + total_score);
								// logger.debug('6-3) result (1이면 정상): ' + row.affectedRows);
							}
						});
					}
					callback(null);
				}
			],
			function(err){
				if(err) logger.error(err);
				callback(null);
			});
		}


		/*
			3)관심-연관 size 클러스터링
				interest_size_name : 관심 아이템 사이즈명
				related_size_name : 연관 아이템 사이즈명
		 */
		var sizeFiltering = function(interest_size_name, related_size_name){
			// logger.debug('3) 관심-연관 size 클러스터링');
			// logger.debug('3) interest_size_name: ' + interest_size_name + ', related_size_name: ' + related_size_name);
			var pass_yn = true;
			// if(!interest_size_name || !related_size_name) logger.error("fail");
			// var interest_size_name_arr = (interest_size_name).split(';');
			// var related_size_name_arr = (related_size_name).split(';');
			// for(var i in interest_size_name_arr){
			// 	if(interest_size_name_arr[i] == "FREE"){
			// 		//FREE 인 경우, 무조건 통과
			// 		pass_yn = true;

			// 	}else if(interest_size_name_arr[i] == "44(XS)" || interest_size_name_arr[i] == "55(S)" || interest_size_name_arr[i] == "66(M)" || interest_size_name_arr[i] == "77(L)" || interest_size_name_arr[i] == "88(XL)"){
			// 		if( Number(related_size_name[i].substring(0,2)) >= Number(interest_size_name_arr[i].substring(0,2))){
			// 			pass_yn = true;
			// 		}

			// 	}else if(Number(interest_size_name_arr[i]) >= 23 && Number(interest_size_name_arr[i]) >= 40){
			// 		if( Number(related_size_name[i].substring(0,2)) >= Number(interest_size_name_arr[i].substring(0,2))){
			// 			pass_yn = true;
			// 		}

			// 	}else if(Number(interest_size_name_arr[i]) >= 225 && Number(interest_size_name_arr[i]) >= 290){
			// 		if( Number(related_size_name[i].substring(0,2)) >= Number(interest_size_name_arr[i].substring(0,2))){
			// 			pass_yn = true;
			// 		}
			// 	}//end_if
			// }//end_for
			// logger.debug('3) size 클러스터링 결과: ' + pass_yn);
			return pass_yn;
		};//end_sizeFiltering


		/*
			4)관심-연관 Euclidean 계산 - (0~1)사이의 값으로 변환
				x: 가격, y: 스타일 매칭 횟수
				interest item : x1, y1
				related item : x2, y2
		 */
		var calculateEucli = function(x1, y1, x2, y2){
			// logger.debug('4) 관심-연관 Euclidean 계산');
			// logger.debug('4) interest_item_saleprice: ' + x1 + ', interest_sty_cnt: ' + y1 + ', related_item_saleprice: ' + x2 + ', related_sty_cnt: ' + y2);
			var eucli = 1 / Math.sqrt((x2-x1)*(x2-x1) + (y2-y1)*(y2-y1));
			return eucli;
		};


		/*
			5)관심도-연관도 거리 계산
				x : interest_weight
				y : euclidean_score
		 */
		var calculateDistance = function(x, y){
			// logger.debug('5) 관심도-연관도 거리 계산');
			// logger.debug('5) interest_weight: ' + x + ', euclidean_score: ' + y);
			return Math.sqrt(x*x + y*y);
		};

	}//end_setEucliAfterSzCluster(function)


};//end_getCurationInfo(object) -> exports

