auto.waitFor();

// ============ 紧急停止：悬浮窗按钮 ============
var stopFlag = false;
try {
    var stopWin = floaty.window(
        '<frame gravity="center" bg="#cc333333" w="80" h="36">' +
        '  <text id="btn" text="停止" textColor="#ffffff" textSize="14sp" gravity="center"/>' +
        '</frame>'
    );
    stopWin.setPosition(50, 200);
    stopWin.btn.click(function () {
        stopFlag = true;
        toast("脚本即将停止");
        setTimeout(function () { exit(); }, 200);
    });
    var dx = 0, dy = 0, downX = 0, downY = 0;
    stopWin.btn.setOnTouchListener(function (view, event) {
        switch (event.getAction()) {
            case event.ACTION_DOWN:
                dx = stopWin.getX(); dy = stopWin.getY();
                downX = event.getRawX(); downY = event.getRawY();
                return false;
            case event.ACTION_MOVE:
                stopWin.setPosition(dx + (event.getRawX() - downX),
                                    dy + (event.getRawY() - downY));
                return true;
        }
        return false;
    });
} catch (e) {
    toast("悬浮窗权限未开，请去设置开启 Auto.js 悬浮窗权限");
}
try {
    events.observeKey();
    events.onKeyDown("volume_down", function () {
        stopFlag = true;
        toast("脚本已停止");
        exit();
    });
} catch (e) {}

function dlog(msg) { console.log(msg); }

dlog("脚本启动");
toast("开启微信中...");

if (!launchApp("微信")) {
    app.launchPackage("com.tencent.mm");
}
sleep(2000);

var WX_PKG = "com.tencent.mm";
if (currentPackage() != WX_PKG) {
    toast("无法启动微信，脚本退出");
    exit();
}

toast("开始抢红包（点悬浮窗停止）");

// 向上找可点击祖先并点击
function clickParent(node) {
    var p = node;
    for (var i = 0; i < 8 && p != null; i++) {
        if (p.clickable()) { p.click(); return true; }
        p = p.parent();
    }
    if (node && node.bounds()) {
        var b = node.bounds();
        click(b.centerX(), b.centerY());
        return true;
    }
    return false;
}

// 在消息列表找红包条目
function findHbInList() {
    var n = textContains("[微信红包]").findOne(2000);
    if (n == null) n = descContains("[微信红包]").findOnce();
    return n;
}

// 红包气泡 id
var HB_BUBBLE_ID = "bkg";
// 已被领完标识 id（text=已被领完）
var EXPIRED_ID = "a3m";

// 在节点子树内查找含某 id 的节点
function subtreeFindById(node, id, depth) {
    if (node == null || depth > 8) return null;
    try {
        var i = node.id();
        if (i && i.indexOf(id) >= 0) return node;
        var cc = node.childCount();
        for (var j = 0; j < cc; j++) {
            var r = subtreeFindById(node.child(j), id, depth + 1);
            if (r != null) return r;
        }
    } catch (e) {}
    return null;
}

// 在聊天界面找未领红包气泡
// 找所有 id("bkg") → 子树不含 id("a3m") 即为未领
function findUnopenedHb() {
    var bubbles = id(HB_BUBBLE_ID).find();
    if (bubbles == null || bubbles.size() == 0) {
        dlog("未找到任何 id(bkg) 红包气泡");
        return null;
    }
    dlog("发现 " + bubbles.size() + " 个红包气泡");

    for (var i = 0; i < bubbles.size(); i++) {
        var bubble = bubbles.get(i);
        if (bubble == null || !bubble.bounds()) continue;
        if (subtreeFindById(bubble, EXPIRED_ID, 0) != null) {
            dlog("红包 #" + i + " 已被领完，跳过");
            continue;
        }
        dlog("红包 #" + i + " 未领取，准备点击");
        return bubble;
    }
    return null;
}

// 点击红包弹层里的"开"按钮
var OPEN_BTN_ID = "j6h";
function clickOpen() {
    var btn = id(OPEN_BTN_ID).findOne(2000);
    if (btn != null) {
        var b = btn.bounds();
        dlog("clickOpen: 命中 id(j6h) bounds=" + b);
        try { btn.click(); } catch (e) {}
        if (b) click(b.centerX(), b.centerY());
        return true;
    }
    btn = desc("开").findOne(1000);
    if (btn) return clickParent(btn);
    btn = text("开").findOne(800);
    if (btn) return clickParent(btn);
    btn = className("android.widget.Button").findOne(800);
    if (btn) { btn.click(); return true; }
    return false;
}

// 返回/关闭红包详情
function backOrClose() {
    var b = desc("返回").findOne(1500);
    if (b) return clickParent(b);
    b = desc("关闭").findOnce();
    if (b) return clickParent(b);
    back();
    return true;
}

function isOpenedDetail() {
    return textContains("已存入零钱").exists()
        || textContains("已领取").exists()
        || textContains("手慢了").exists()
        || textContains("已被领完").exists()
        || textContains("已过期").exists()
        || textContains("红包详情").exists();
}

function backToList() {
    var b = desc("返回").findOnce();
    if (b) clickParent(b);
    else back();
}

// 主循环
var lastWaitLog = 0;
var loopCount = 0;

while (true) {
    if (stopFlag) { dlog("收到停止信号，退出"); exit(); }
    loopCount++;

    try {
        if (currentPackage() != WX_PKG) {
            dlog("不在微信，重新启动");
            launchApp("微信");
            sleep(2000);
            continue;
        }

        var hbItem = findHbInList();
        if (hbItem == null) {
            var now = Date.now();
            if (now - lastWaitLog > 10000) {
                dlog("等待红包... (循环" + loopCount + ")");
                lastWaitLog = now;
            }
            sleep(2000);
            continue;
        }

        dlog("发现红包消息，进入聊天");
        clickParent(hbItem);
        sleep(1500);

        var grabCount = 0;
        while (true) {
            sleep(600);
            var redItem = findUnopenedHb();
            if (redItem == null) {
                dlog("聊天内无未领红包");
                break;
            }

            dlog("点击红包气泡");
            clickParent(redItem);
            sleep(1000);

            if (clickOpen()) {
                dlog("点击了 开");
                sleep(1500);
                if (isOpenedDetail()) {
                    dlog("红包已结算，返回");
                }
                backOrClose();
                sleep(800);
            } else {
                if (isOpenedDetail()) {
                    dlog("红包已失效（手慢了/已领完），返回");
                } else {
                    dlog("未找到开按钮，关闭弹层");
                }
                backOrClose();
                sleep(600);
            }

            grabCount++;
            if (grabCount > 15) {
                dlog("防卡：单次聊天抢红包上限");
                break;
            }
        }

        backToList();
        sleep(1200);

    } catch (e) {
        dlog("异常：" + e);
        sleep(1500);
        try { back(); } catch (_) {}
    }
}
