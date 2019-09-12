import LhdzGame from "./lhdzGame";

import GameMsg from "../game-share/gameMsg";
import { add } from "../common/util";

let pomelo = window.pomelo;
const { ccclass, property } = cc._decorator;

export enum GameStatus {
    FREE,
    BET,         //下注
    DEAL_CARD,   //发牌以及展示阶段
    RESULT,      //结算阶段
    END,
}

export interface LhdzUser {
    rPos: number,
    chgMoney: string,
    winCount: number,
    totalBets: number,
}

export interface LhdzCardsInfo {
    area: number,
    card: number
}

export interface areaBetInfo {
    area: number,
    betPoint: string,
}

interface userInfo {
    rPos: number,
    betsInfo: areaBetInfo[],
    winCount: number,
    totalBets: number,
}

@ccclass
export default class LhdzMsg extends GameMsg {
    loadGameHandler = "game.LHHandler.loadGameInfo";
    notifyCurrentGame = "lhGameStation";
    protected game: LhdzGame;

    private userPosList: number[] = [];

    protected addExtraListeners(): void {
        pomelo.on("userMoney", this.handleUserMoney.bind(this));
        pomelo.on("lhBroadcastEnterDealCard", this.handleEnterDealCard.bind(this));
        pomelo.on("lhBroadcastEnterBet", this.handleEnterBet.bind(this));
        pomelo.on("LhdzCleanBetRsp", this.handleCleanBetRsp.bind(this));
        pomelo.on("lhBroadcastUserDoBets", this.handleUserDoBets.bind(this));
        pomelo.on("lhGameResult", this.handleGameResult.bind(this));
    }

    protected removeExtraListeners(): void {
        pomelo.off("userMoney");
        pomelo.off("lhBroadcastEnterDealCard");
        pomelo.off("lhBroadcastEnterBet");
        pomelo.off("LhdzCleanBetRsp");
        pomelo.off("lhBroadcastUserDoBets");
        pomelo.off("lhGameResult");
    }

    private handleUserMoney = (data: { money: string }) => {
        let me = this.game.playerMgr.me;
        me.balance = add(data.money, 0).toNumber();
        me.updateBets(0, me.balance, true);
    }

    handleStartGame = (data: { willChangeRoom: number, gameNo: string }) => {
        this.game.labGameId.string = data.gameNo;
        this.game.playVsAnim();
        this.game.lhdzTrend.isTouchNext = true;
        this.game.playerMgr.setBigRegalGambleGodPos();
    }

    /**
     * 开始下注
     * @param data
     */
    private handleEnterBet(data: { leftTime: number }) {
        this.game.changeState(GameStatus.BET);
        this.game.setTimer(data.leftTime);
    }

    /**
     * 用户下注
     * @param data
     */
    private handleUserDoBets(data: { rPos: number, bets: number, area: number }) {
        this.game.setTotalAreaMoney(data.area, data.bets);
        this.game.userDoBets(data.rPos, data.area, data.bets.toString());
    }

    /**
     * 取消下注
     * @param data
     */
    private handleCleanBetRsp(data: { rPos: number, betPointAll: areaBetInfo[] }) {
        this.game.cleanPlayerBet(data.rPos, data.betPointAll);
    }

    /**
     * 发牌
     * @param data
     */
    private handleEnterDealCard(data: { leftTime: number, cardsInfo: LhdzCardsInfo[] }) {
        this.game.changeState(GameStatus.DEAL_CARD);
        this.game.setRedBlackCards(data.cardsInfo);
        this.statisticsShowPos();
        this.game.lhdzTrend.isTouchNext = false;
    }

    /**
     * 结算
     */
    private handleGameResult(data: { winArea: number, users: LhdzUser[], isShuffle: number }) {
        this.game.setWinAreaEff(data.winArea);
        this.game.userStatistics(data.winArea, data.users);
        if (data.isShuffle) {
            this.game.clearRecords();
        }
        if (this.game.records) {
            let records = this.game.records;
            records.push(data.winArea);
            this.game.setRecords(records);
        }

        // 同步桌子以外玩家信息
        if (data.users) {
            for (let idx = 0; idx < data.users.length; idx++) {
                const userInfo = data.users[idx];
                if (this.userPosList.indexOf(userInfo.rPos) === -1) {
                    this.game.playerMgr.updatePlayerInfo(userInfo.rPos, userInfo.chgMoney);
                }
                this.game.playerMgr.updateTotalBets(userInfo.rPos, userInfo.totalBets, userInfo.winCount);
            }
        }
    }

    /**
     * 断线重连
     * @param data
     */
    protected handleCurrentGameInfo(data: {
        gameStatus: number, leftTime: number, winRecord: number[], winArea?: number,
        cardsInfo?: LhdzCardsInfo[], users?: userInfo[], areaBet?: areaBetInfo[],
    }) {
        super.handleCurrentGameInfo(data);
        let isShowWaitTips = true;     // 根据自己是否下注判断是否显示等待提示信息
        if (data.users) {
            // 减去自己和桌上玩家下的筹码，同步余额
            let selfAreaBet: number[] = [0, 0, 0];
            for (const user of data.users) {
                let player = this.game.getBetPlayer(user.rPos);
                if (player && user.betsInfo && user.betsInfo.length !== 0) {
                    let betMoney = 0;
                    for (const betsInfo of user.betsInfo) {
                        betMoney = add(betMoney, betsInfo.betPoint).toNumber();
                        if (player.isMe) {
                            selfAreaBet[betsInfo.area] += betMoney;
                        }
                        player.doBet(betsInfo.area, betsInfo.betPoint, false);
                    }
                }
                // 同步下注额
                this.game.playerMgr.updateTotalBets(user.rPos, user.totalBets, user.winCount);
            }
            // 设置自己所下注区域筹码
            for (let idx = 0; idx < selfAreaBet.length; idx++) {
                const bet = selfAreaBet[idx];
                if (bet > 0) {
                    this.game.setSelfAreaMoney(idx, bet);
                    isShowWaitTips = false;
                }
            }
            this.game.playerMgr.setBigRegalGambleGodPos();
        }

        this.game.menu.hideChangeBtn();
        if (data.winRecord && data.winRecord.length > 0) {
            this.game.setRecords(data.winRecord, true);
        }

        if (data.gameStatus === GameStatus.FREE) {
            return;
        } else if (data.gameStatus === GameStatus.BET) {
            this.game.beginBet(data.leftTime);
            this.game.setCardsStatus(true);
        } else {
            //显示等待提示
            if (isShowWaitTips) {
                this.game.showWaitTips();
            } else {
                this.game.hideWaitTips();
            }

            if (data.cardsInfo) {
                this.game.quickShowCards(data.cardsInfo);
            }
            if (data.gameStatus === GameStatus.DEAL_CARD) {
                this.statisticsShowPos();
            }
            // 记录的最后一条就是最新的
            if (data.gameStatus === GameStatus.RESULT && (data.winArea !== undefined)) {
                this.game.setWinAreaEff(data.winArea);
            }
            if (data.gameStatus > GameStatus.DEAL_CARD) {
                this.game.setRestShow(true);
            }
        }

        // 设置下注区域总筹码
        if (data.areaBet) {
            for (const areaBet of data.areaBet) {
                let showClips = true;
                if (data.gameStatus === GameStatus.END) {
                    showClips = false;
                }
                let bet = add(areaBet.betPoint, 0).toNumber();
                this.game.setTotalAreaMoney(areaBet.area, bet, showClips);
            }
        }
    }

    private statisticsShowPos() {
        // 需要结算的玩家
        let playerPosArr: number[] = [];
        this.game.playerMgr.playerArr.forEach((player) => {
            if (player.uid !== 0) {
                playerPosArr.push(player.serverPos);
            }
        });
        playerPosArr.push(this.game.fhPlayer.serverPos);
        playerPosArr.push(this.game.dsPlayer.serverPos);
        // 去重
        let newPlayerArr: number[] = []
        for (const pos of playerPosArr) {
            if (newPlayerArr.indexOf(pos) === -1 && pos !== undefined) {
                newPlayerArr.push(pos);
            }
        }
        this.userPosList = newPlayerArr;
    }

    sendDoBets(areaIdx: number, bets: number) {
        pomelo.notify("game.LHHandler.doBets", { area: areaIdx, bets: bets });
    }

    sendCancelBet() {
        pomelo.notify("game.LHHandler.cleanBet", {});
    }
}
