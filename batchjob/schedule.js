var express = require('express');
var schedule = require('node-schedule');
var logger = require('./logger');
var curation = require('./curation');


// cron 스타일로 설정
// [MINUTE] [HOUR] [DAY OF MONTH] [MONTH OF YEAR] [DAY OF WEEK] [YEAR (optional)]
// 분 시 일 월 요일 년
// (0-59) (0~23) (1~31) (1~12) (0~7):0(또는7)이 일요일.
// '* * * * * *' - runs every second
// '*/5 * * * * *' - runs every 5 seconds
// '10,20,30 * * * * *' - run at 10th, 20th and 30th second of every minute
// '0 * * * * *' - runs every minute
// '0 0 * * * *' - runs every hour (at 0 minutes and 0 seconds)

var cronStyle = '*/5 * * * *'; // 매 분마다 실행.
var j3 = schedule.scheduleJob(cronStyle, function(){
	logger.info('5 분마다 실행');
	curation.curationAlgorithm(function(err){
		if(err){
			logger.info('Fail!!!!!!!!!!!!!!!');
		}else{
			logger.info('Curation process successfully!!!!!');
		}
   });
});
logger.info('5 분마다 실행할 준비 완료');