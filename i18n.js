// Chinese remains the authoring language; a DOM adapter also translates dynamic
// status messages. Player-entered nicknames are kept verbatim.
const PHRASES = [
['单人赛道，镜头跟随你的赛车','Single-player circuit, camera following your car'],['单人完整视野斜后方赛车。自定义按键见下方操作说明。','Full-view single-player chase-camera racing. See the controls below for your custom key bindings.'],
['更改地图/模式','Change track / mode'],['泰晤士河岸','Thames Riverside'],['伦敦河岸','London Riverside'],
['北京古都','Imperial Beijing'],['奥斯汀河谷','Austin River Valley'],['里约海岸','Rio Coast'],
['选择赛道，开始下一局','Choose a circuit for the next race'],['AI 自动驾驶 · 遵循相同物理规则','AI drives automatically with the same physics rules'],['或','or'],
['从 GO 开始','From GO'],['起终点之间','Line to line'],
['TWIN TURBO · 双人分屏赛车','TWIN TURBO · Split-screen Racing'],
['沿着风景，一路较量。','Take the scenic rivalry.'],['一圈约 40–60 秒。长直道、连续 S 弯和发夹弯，穿越三种风景。','A 40–60 second lap. Long straights, flowing S bends and hairpins across three landscapes.'],
['与身边的朋友，共用一块键盘。','One keyboard. Two drivers. One great rivalry.'],['按 空格键 也可出发','Or press Space to start'],['按 Esc 或 空格键 继续','Press Esc or Space to resume'],
['无法启用 3D 画面。请开启浏览器硬件加速，再刷新页面。','3D graphics are unavailable. Enable hardware acceleration in your browser, then refresh.'],['请使用支持 WebGL 的桌面浏览器。','Please use a desktop browser with WebGL support.'],
['稍作停留。','Take a breather.'],['准备好后，继续你们的对决。','Ready when you are.'],['成绩已保留，等待对手完赛','Your result is kept while the other driver finishes.'],
['直道加速，弯道松油','Accelerate on straights. Ease off in corners.'],['斜后方跟车 · 弯前注意减速','Chase camera · Brake before the turn'],['连接键盘或使用电脑，即可开始双人对战。','Use a computer or connect a keyboard to race.'],
['一个昵称，一次保存整场成绩、最快单圈和幽灵。开赛时可选择两个幽灵，也能从榜上发起挑战。','One nickname, one save for your race, best lap and ghosts. Choose up to two opponents before the start.'],
['留下这场较量','Keep this race'],['每位车手只需保存一次。','One save per driver.'],['本地对战 · 在线全站榜 · 无需账号','Local racing · Shared leaderboards · No account needed'],
['发车前，选好对手。','Choose your challengers.'],['可以直接出发，也可以带上两位幽灵一起跑。','Race on your own or bring two ghosts along.'],['这次想挑战哪两位？','Which two will you challenge?'],['点榜单上的颜色加入，最多两个，不会碰撞。','Choose a color on the leaderboard. Up to two ghosts, with no collisions.'],['打开后读取可挑战的记录。','Available challengers load here.'],
['按你的习惯驾驶。','Make it your drive.'],['点击一个按键，再按下想使用的键。设置会保存在这台设备。','Select an action, then press a key. Your settings stay on this device.'],['发车前，了解一下。','A quick drivers’ briefing.'],
['两位玩家共用键盘，各占半个屏幕，使用斜后方 3D 镜头跟随自己的赛车。先完成全部圈数的玩家获胜；另一位可继续跑完，双方完赛后一起结算。','Share one keyboard with a chase camera for each driver. The first to finish wins, and the other can finish their race before results appear.'],
['两位玩家共用键盘，各占半个屏幕。先完成全部圈数的玩家获胜；另一位可继续跑完，双方完赛后一起结算。','Share one keyboard and a split screen. The first to finish wins; both drivers can complete the race.'],
['镜头全屏跟随你的赛车，与 AI 在同一赛道较量。两套键位均控制你的赛车：WASD / 左 Shift / Q，或方向键 / Enter / 斜杠；也可在「自定义按键」中修改。两车遵循相同物理和赛道规则，双方完赛后结算。','The full view follows your car as you race the AI on the same circuit. Use WASD / Left Shift / Q or Arrow keys / Enter / Slash. Customize either set in Key bindings. Both cars follow the same physics and track rules.'],
['每圈设 3 个计时门和终点计时点。通过后显示与对手在同一圈、同一点的差距；载入幽灵时也会显示单圈对比。这条赛道有长直道、连续 S 弯和回头弯。弯前松油或轻点刹车，出弯再用氮气。氮气会自动恢复。树木、建筑与护栏会挡住车辆，撞上会减速；轻微压路肩仍能正常计圈，大幅抄近路不能完成一圈。卡住时，玩家一按','Each lap has three timing gates and a finish split. Compare times at the same point, including your ghosts. Ease off before bends and use nitro on exit. Nitro recharges automatically. Trees, buildings and barriers are solid. Cutting too far off course will invalidate the lap. If stuck, P1 presses '],
['、玩家二按',', and P2 presses '],['返回赛道，并承受 2 秒罚停。',' to recover, with a 2-second penalty.'],['暂停 / 继续 · 离开游戏窗口会自动暂停。','Pause / resume · Switching away automatically pauses the race.'],
['点击要修改的动作，再按一个新键。重复键会提示；Esc 取消选键。','Select an action, then press a new key. Duplicate keys are rejected; Esc cancels.'],
['请选择字母、数字、方向键、Shift、Enter 或标点键；空格和 Esc 留给开始与暂停。','Use a letter, number, arrow, Shift, Enter or punctuation key. Space and Esc are reserved for starting and pausing.'],
['请只按一个键，不使用系统组合键。','Press one key without a system modifier.'],['已恢复默认键位并保存。','Default key bindings restored and saved.'],['已恢复默认键位，本次游玩有效。','Default keys restored for this session.'],['键位已修改，本次游玩有效。','Key updated for this session.'],['键位已保存。','Key binding saved.'],['已取消选键。','Key change cancelled.'],['请使用浏览器的全屏功能','Please use your browser’s fullscreen control'],
['输入昵称查找幽灵，也可以找自己的最快单圈。','Search a nickname, including your own.'],['选择紫色或金色，再查找想挑战的昵称。','Choose purple or gold, then search a driver’s nickname.'],['本场不带幽灵，已选记录会保留供下次使用。','Ghosts are off for this race. Your choices remain available.'],['昵称已修改，请重新查找；已加入的幽灵会保留。','Nickname changed. Search again; your selected ghosts are kept.'],['可以选择两个不同颜色的幽灵，也可以直接发车。','Choose two colored ghosts, or head straight to the start.'],
['连接超时，请重试。','Connection timed out. Please retry.'],['这份幽灵已不存在，请重新查找。','This ghost is no longer available. Search again.'],['暂时无法连接记录服务，请稍后重试。','Records are temporarily unavailable. Please retry.'],['记录版本已变化，请刷新游戏后重试。','The record version changed. Please refresh the game.'],['暂时无法连接记录服务，请联网后重试。','Could not connect to records. Check your connection and retry.'],['暂时无法连接记录服务。','Could not connect to records.'],['先输入昵称，最多 16 个字符。','Enter a nickname, up to 16 characters.'],['请输入昵称，最多 16 个字符。','Enter a nickname, up to 16 characters.'],['请先查找并选择一份幽灵。','Search for and choose a ghost first.'],['这份幽灵数据不完整，请重新查找。','This ghost is incomplete. Please search again.'],
['本场只显示完整 3 圈幽灵，计时从发车到完赛。','Only full three-lap ghosts appear here, timed from GO to the finish.'],['本场只显示单圈幽灵，挑战一圈极限。','Only single-lap ghosts appear here. Make every corner count.'],['可以按昵称查找，或直接出发。','Search a nickname or start without ghosts.'],['本场未载入幽灵。回到发车准备后可以选择。','No ghosts loaded. Choose them in race setup.'],['选择一个颜色，查找想挑战的幽灵；也可以直接发车。','Choose a color and find a ghost, or start without one.'],['游戏仍可正常进行。','You can still race.'],
['幽灵记录版本不匹配。','Ghost record version mismatch.'],['榜单版本或类别不匹配。','Leaderboard version or category mismatch.'],['还没有成绩，完成比赛或有效单圈后保存，留下第一条记录。','No records yet. Finish a race or a valid lap, then save your time.'],['按最快单圈排名；整场成绩可切换 1 圈或 3 圈查看。','Fastest individual laps. Switch to 1 or 3 laps for race standings.'],
['一个昵称，一次保存。符合条件的总成绩、最快单圈与幽灵将一起记录。','One nickname, one save. Your eligible race time, best lap and ghosts are saved together.'],['未确认总成绩。','Race result was not confirmed.'],['未确认单圈成绩。','Lap result was not confirmed.'],['正在保存成绩与幽灵…','Saving your results and ghosts…'],['整场成绩已保存','Race result saved'],['整场成绩未进前五','Race result is outside the top five'],['最快单圈与幽灵已保存','Lap result and ghost saved'],['三圈整场幽灵已保存','Full three-lap ghost saved'],['暂未确认；重试只补存这一部分，昵称不用重填',' not confirmed. Retry only saves the missing part; no need to re-enter your name'],
['整场用时榜','Race leaderboard'],['最快单圈榜','Fastest lap leaderboard'],['整场成绩榜','Race leaderboard'],['成绩时间','Time'],['全站最快五名','Global top five'],['全站速度榜','Global leaderboard'],['个人最快单圈','Personal best lap'],['最快有效单圈','Best valid lap'],['完整 3 圈幽灵榜','Three-lap ghost leaderboard'],['最快单圈幽灵榜','Single-lap ghost leaderboard'],['完整 3 圈幽灵','Full three-lap ghost'],['三圈幽灵','Three-lap ghost'],['单圈幽灵','Single-lap ghost'],['最快单圈','Fastest lap'],['整场用时','Race time'],['完赛用时','Finish time'],['成绩与幽灵','Results & ghosts'],['保存成绩与幽灵','Save results & ghosts'],['保存我的成绩','Save my results'],['重试未保存部分','Retry unsaved results'],['搜索自己的幽灵','Search your ghost'],['输入自己或对手的完整昵称','Enter your or an opponent’s full nickname'],['选择幽灵记录','Choose a ghost record'],
['海岸技术环线','Harbor Technical'],['海岸港湾','Sunset Harbor'],['松林山谷','Pine Valley'],['霓虹城区','Neon District'],['青色闪电','Cyan Lightning'],['橙色风暴','Orange Storm'],['青色车手','Cyan driver'],['橙色车手','Orange driver'],['双人分屏','Split-screen'],['分屏竞速','SPLIT-SCREEN RACING'],['一决高下','Settle it on the track'],['本地双人','Local two-player'],['单人挑战 AI','Solo vs AI'],['标准大奖赛','Grand Prix'],['极速竞技','Sprint'],['我的赛车','My car'],['开始比赛','Start race'],['成绩榜','Leaderboards'],['自定义按键','Key bindings'],['调整键位','Key bindings'],['退出全屏','Exit fullscreen'],['返回发车区','Back to the grid'],['返回菜单','Back to menu'],['继续比赛','Resume race'],['再来一局','Race again'],['确认发车','Start the race'],['不带幽灵，直接出发','Start without ghosts'],['带幽灵出发','Race with ghosts'],['重试榜单','Retry leaderboard'],['重新连接','Reconnect'],['准备好了','Ready'],['玩家一','Player one'],['玩家二','Player two'],['恢复默认按键','Restore defaults'],['等待发车','On the grid'],['准备出发','Get ready'],['比赛进行中','Racing'],['比赛已暂停','Paused'],['比赛结束','Race finished'],['等待另一位完赛','Waiting for the other driver'],['返回赛道 · 罚停中','Recovering · penalty'],['返回赛道 · 罚停 2 秒','Recovered · 2-second penalty'],['碰撞 · 减速','Impact · slowing down'],['草地减速','Off-road slowdown'],['全油门出发','FULL THROTTLE'],['逆向行驶','Wrong way'],['直道 · 氮气时机','Straight · use nitro'],['前方右弯 · 松油减速','Right turn · ease off'],['前方左弯 · 松油减速','Left turn · ease off'],['窄拱门 · 居中减速通过','Narrow passage · slow down'],
['关闭声音','Mute sound'],['开启声音','Enable sound'],['声音关','Sound off'],['声音开','Sound on'],['全屏','Fullscreen'],['怎么玩','How to play'],['暂停','Pause'],['继续','Resume'],['重开','Restart'],['加速','Accelerate'],['刹车 / 倒车','Brake / reverse'],['向左转','Turn left'],['向右转','Turn right'],['向左','Left'],['向右','Right'],['回到赛道','Recover'],['返回赛道','Recover'],['转向','Steer'],['氮气','Nitro'],['复位','Recover'],['驾驶','Drive'],['左 Shift','Left Shift'],['右 Shift','Right Shift'],['小键盘','Numpad'],['方向键','Arrow keys'],['斜杠','Slash'],
['请按一个键…','Press a key…'],['尚未选择','Not selected'],['选择此颜色','Use this color'],['未加入','Not added'],['未录制','No replay'],['待查询','Checking…'],['正在载入…','Loading…'],['正在读取全站成绩…','Loading records…'],['正在读取全站速度榜…','Loading leaderboard…'],['本场未完赛','Race not finished'],['你的昵称','Your nickname'],['已完成','Saved'],['排名','Rank'],['车手','Driver'],['挑战幽灵','Challenge ghost'],['个人最好成绩','personal best'],['整场成绩','Race result'],['单圈与幽灵','Lap & ghost'],['紫色幽灵','Purple ghost'],['金色幽灵','Gold ghost'],['查找','Search'],['移除','Remove'],['已选','Selected'],['选择','Select'],['替换','Replace '],['加入','Add '],['紫色','Purple'],['金色','Gold'],['青色','Cyan'],['橙色','Orange'],['幽灵','ghost'],['完成','Done'],['计时点','Checkpoint'],['终点','Finish'],['对手','opponent'],['海港','Harbor'],['本圈','Lap'],['最快','Best'],['单人','Solo'],['对战','vs'],['或',' or '],['圈','lap(s)'],
];
PHRASES.push(
['沿着风景，一路较量。','Race through the scenery.'],
['选择赛道','Choose a circuit'],['原版保留 · 六条新路线','The original circuit plus six new routes'],
['七条紧凑赛道 · 全部支持双人、AI 与双幽灵','Seven compact circuits · Two players, AI racing and two ghosts on every route'],['赛道预览','Circuit preview'],
['选择语言','Choose your language'],['选好语言就能出发，之后也可以随时切换。','Choose a language to start. You can change it anytime.'],
['输入完整昵称，也能查找榜外车手','Enter a full nickname, including drivers outside the top five'],
['本场只显示当前赛道完整 3 圈幽灵，计时从发车到完赛。','Full three-lap ghosts for this circuit, timed from GO to the finish.'],
['本场只显示当前赛道的单圈幽灵，挑战一圈极限。','Single-lap ghosts for this circuit. Set your fastest lap.'],
['最快单圈前五 · 每次成绩独立排名，同一昵称可多次上榜。','The five fastest laps. Each saved attempt ranks separately; one driver can hold several places.'],
['部分幽灵暂未读取，可重试。','Some ghosts could not be loaded. Please retry.'],
['暂时无法读取全站速度榜，游戏可照常进行。','The leaderboard is unavailable. You can still race.'],
['未确认幽灵成绩。','The ghost result was not confirmed.'],['未确认保存结果。','The save was not confirmed.'],
['未能确认保存。原昵称和成绩已保留，联网后重试；不会重复提交。','Could not confirm the save. Your nickname and result are kept. Reconnect and retry; this will not create duplicates.'],
['正在保存单圈与幽灵…','Saving your lap and ghost…'],['正在读取最快单圈…','Loading the fastest laps…'],
['已保存','Saved'],['已保留更快纪录','Faster record kept'],['重试保存','Retry save'],['保存单圈与幽灵','Save lap & ghost'],
['单圈榜还空着，完成一圈并保存，就能留下第一条记录。','No lap records yet. Complete and save a lap to set the first time.'],
['本局最快有效单圈 · 保存后可按昵称找到幽灵','Your best valid lap this race · Save it to find the ghost by nickname'],
['昵称、单圈时间和驾驶轨迹会公开。每个昵称只保留最快的一圈。','Your nickname, lap time and replay will be public. Only your fastest lap is kept.'],
['海港 · 全站最快单圈前五，每个昵称保留最好成绩。','Harbor · The five fastest personal bests.'],
['全屏游戏','Fullscreen game'],['Twin Turbo 首页','Twin Turbo home'],['本局单圈时间','Current race lap times'],
['比赛状态','Race status'],['已完成圈数','Completed laps'],['暂停比赛','Pause race'],['重新开始比赛','Restart race'],
['左右分屏赛道，左侧玩家一，右侧玩家二','Split-screen circuit: player one on the left, player two on the right'],
['左右分屏 3D 斜后方跟车赛车。玩家一 WASD 驾驶，左 Shift 加速；玩家二方向键驾驶，Enter 加速。','3D split-screen chase-camera racing. Player one uses WASD and Left Shift for nitro; player two uses Arrow keys and Enter for nitro.'],
['左右分屏斜后方赛车。自定义按键见下方操作说明。','Split-screen chase-camera racing. See the controls below for your custom key bindings.'],
['赛道风景','Circuit scenery'],['游戏模式','Race mode'],['选择你的赛车颜色','Choose your car color'],['比赛圈数','Race distance'],
['你驾驶青色赛车，AI 驾驶橙色赛车。','You drive cyan; the AI drives orange.'],['两位车手完赛成绩','Both drivers’ results'],
['键盘操作说明','Keyboard controls'],['AI 自动驾驶 · 可用 WASD 或方向键驾驶','AI drives automatically · You can use WASD or Arrow keys'],
['成绩排行方式','Leaderboard category'],['海港全站成绩榜','Global harbor leaderboard'],['海港最快单圈前五','Harbor’s five fastest laps'],
['返回发车设置','Back to race setup'],['选择幽灵颜色','Choose a ghost color'],['移除紫色幽灵','Remove purple ghost'],['移除金色幽灵','Remove gold ghost'],
['关闭按键设置','Close key bindings'],['关闭操作说明','Close driving instructions'],['完整 3 圈','Three-lap'],['单圈','Single-lap'],
['1 圈极速竞技','1-lap sprint'],['选紫色','Choose purple'],['选金色','Choose gold'],['已选紫色','Purple selected'],['已选金色','Gold selected'],
['挑战三圈幽灵','Challenge three-lap ghost'],['挑战单圈幽灵','Challenge single-lap ghost'],['加入紫色幽灵','Add purple ghost'],['加入金色幽灵','Add gold ghost'],
['替换紫色幽灵','Replace purple ghost'],['替换金色幽灵','Replace gold ghost'],
['已找到记录。','Record found. '],['圈','laps'],
['蔚蓝海湾','Azure Bay'],['游艇港湾','Marina'],['海港大奖赛','Harbor Grand Prix'],['双螺旋高架','Spiral Flyover'],
['单圈用时','Lap time'],['全站前五名','Global top five'],
['对战 AI',' vs AI'],
);
const exact = new Map(PHRASES);
const pieces = [...exact].sort((a,b)=>b[0].length-a[0].length);
export function translateText(value, language='en') {
  if(language!=='en'||typeof value!=='string'||!/[\u3400-\u9fff]/.test(value))return value;
  const leading=value.match(/^\s*/)[0],trailing=value.match(/\s*$/)[0],text=value.trim();
  if(exact.has(text))return leading+exact.get(text)+trailing;
  const names=[];
  // Quoted button labels are UI, while every other quoted value is a nickname.
  let out=text.replace(/点击「((?:加入|替换)(?:紫色|金色)幽灵)」确认/g,(_,action)=>`Click “${exact.get(action)}” to confirm`);
  out=out.replace(/「([^」]+)」/g,(_,name)=>`\uE000${names.push(name)-1}\uE001`);
  out=out.replace(/第 (\d+) 圈完成/g,'Lap $1 complete').replace(/第 (\d+) 圈/g,'Lap $1').replace(/第 (\d+) 名 · 已完赛/g,'P$1 · Finished')
    .replace(/两位车手均已完成 (\d+) 圈/g,'Both drivers completed $1 laps').replace(/(.+)获胜！/g,'$1 wins!')
    .replace(/(领先|落后)(.+?) ([+−][\d.]+) 秒/g,(_,direction,target,gap)=>`${direction==='领先'?'Ahead of':'Behind'} ${target} ${gap}s`)
    .replace(/与(.+)并驾齐驱/g,'Level with $1').replace(/(.+)尚未通过/g,'Waiting for $1')
    .replace(/漏过检查点 · 按 (.+) 回赛道/g,'Missed checkpoint · $1 to recover')
    .replace(/你驾驶(.+)赛车，与 AI 较量。WASD 或方向键均可驾驶。/g,'Drive the $1 car against AI. Use WASD or Arrow keys.')
    .replace(/你驾驶(.+)赛车，AI 使用另一种颜色。/g,'You drive the $1 car; AI uses the other color.')
    .replace(/AI 自动驾驶 · 你使用 (.+) 驾驶/g,'AI drives automatically · You use $1')
    .replace(/为 P(\d) 的(.+)按一个新键；Esc 取消。/g,'Press a new key for P$1 $2; Esc cancels.')
    .replace(/(.+) 已用于 P(\d) 的(.+)，请换一个键。/g,'$1 is already used for P$2 $3. Choose another key.')
    .replace(/P(\d) 成绩昵称/g,'P$1 record nickname')
    .replace(/P(\d) 幽灵昵称/g,'P$1 ghost nickname')
    .replace(/P(\d) (.+)按键/g,'P$1 $2 key')
    .replace(/玩家(\d)计时点差距/g,'Player $1 checkpoint gap')
    .replace(/^(选择|移除)(.+)为(紫色|金色)幽灵$/g,(_,action,name,color)=>`${action==='移除'?'Remove':'Choose'} ${name} ${action==='移除'?'from':'as'} the ${color==='紫色'?'purple':'gold'} ghost`)
    .replace(/^挑战(.+)的(三圈|单圈)幽灵$/g,(_,name,kind)=>`Challenge ${name}’s ${kind==='三圈'?'three-lap':'single-lap'} ghost`)
    .replace(/正在为(.+)幽灵查找(.+)…/g,'Searching $2 for the $1 ghost…')
    .replace(/正在载入(.+)幽灵…/g,'Loading the $1 ghost…')
    .replace(/(.+)幽灵已移除。/g,'$1 ghost removed.')
    .replace(/要把(.+)加入哪种颜色？选择紫色或金色后，点击加入按钮。/g,'Which color for $1? Choose purple or gold, then Add.')
    .replace(/ 当前颜色已有幽灵，确认后会替换。/g,' This color is occupied; confirming replaces it.')
    .replace(/(.+)已就绪：(.+)。可切换颜色挑选或更换幽灵，准备好后确认发车。/g,'$1 ready: $2. Choose another color or start when ready.')
    .replace(/(.+)已就绪：/g,'$1 ready: ')
    .replace(/已找到记录。点击(.+)确认。/g,'Record found. Click $1 to confirm.')
    .replace(/点击(.+)确认。/g,'Click $1 to confirm.')
    .replace(/本场幽灵：/g,'Ghosts this race: ')
    .replace(/还没有(.+)的(.+)幽灵。完成对应比赛(?:并保存后再来。|后，可以在成绩区保存。)/g,'No $2 ghost for $1 yet. Finish that race, then save it in Results & ghosts.')
    .replace(/(完整 3 圈|最快单圈)前五 · 点颜色加入，再点一次取消。已选颜色可替换。/g,'Top five $1 ghosts · Choose a color to add a ghost; click again to remove it. You can replace either color.')
    .replace(/还没有(完整 3 圈|单圈)幽灵上榜。可以直接出发，完赛后保存自己的幽灵。/g,'No $1 ghosts yet. Race now and save your ghost after the finish.')
    .replace(/还没有(.+)记录。完成比赛后保存，就能成为第一位挑战者。/g,'No $1 records yet. Finish and save a race to start the board.')
    .replace(/正在读取可挑战的(.+)记录…/g,'Loading $1 challengers…')
    .replace(/已保留更快的单圈与幽灵 ([\d:.]+)/g,'Faster lap and ghost retained: $1')
    .replace(/已保留更快的三圈幽灵 ([\d:.]+)/g,'Faster three-lap ghost retained: $1')
    .replace(/(\d+) 圈 · 按整场完赛时间排名；单圈为该昵称的个人最好成绩。/g,'$1 laps · Ranked by total race time. ')
    .replace(/(\d+) 圈整场前五 · 每次完赛独立排名，同一昵称可多次上榜。/g,(_,laps)=>`The five fastest ${laps}-lap races. Each finish ranks separately; one driver can hold several places.`)
    .replace(/海港 (\d+) 圈整场前五/g,'Harbor’s five fastest $1-lap races')
    .replace(/(.+)的单圈与幽灵已保存，下次开赛前搜索这个昵称即可。/g,'$1’s lap and ghost are saved. Search this nickname before your next race.')
    .replace(/(.+)已有更快纪录 ([\d:.]+)，继续保留原来的幽灵。/g,'$1 already has a faster time of $2. The existing ghost is kept.')
    .replace(/完整 3 圈/g,'three-lap')
    .replace(/\b(\d+) 圈/g,(_,count)=>`${count} ${count==='1'?'lap':'laps'}`)
    .replace(/已用于/g,'already used for').replace(/秒/g,'s');
  for(const [from,to]of pieces)out=out.split(from).join(to);
  out=out.replace(/；/g,'; ').replace(/，/g,', ').replace(/。/g,'.').replace(/、/g,', ');
  out=out.replace(/\uE000(\d+)\uE001/g,(_,i)=>`“${names[Number(i)]}”`);
  return leading+out+trailing;
}
export function createI18n({document,storage,onChange=()=>{}}={}) {
  let language='zh';try{if(storage?.getItem('twin-turbo-language')==='en')language='en';}catch{}
  const sources=new WeakMap(),attributes=new WeakMap();let observer=null;
  const skip=node=>node.parentElement?.closest?.('[data-i18n-skip], [translate="no"], script, style, input, textarea, option');
  function text(node){if(skip(node))return;const prior=sources.get(node),source=prior&&node.nodeValue===prior.rendered?prior.source:node.nodeValue;const rendered=translateText(source,language);sources.set(node,{source,rendered});if(node.nodeValue!==rendered)node.nodeValue=rendered;}
  function walk(node){
    if(!node)return;if(node.nodeType===3){text(node);return;}
    if(node.nodeType!==1&&node.nodeType!==9)return;
    if(node.matches?.('[data-i18n-skip], [translate="no"], script, style'))return;
    if(node.getAttribute){let saved=attributes.get(node);if(!saved){saved=new Map();attributes.set(node,saved);}for(const name of ['title','aria-label','placeholder']){const current=node.getAttribute(name);if(current===null)continue;const prior=saved.get(name),source=prior&&current===prior.rendered?prior.source:current,rendered=translateText(source,language);saved.set(name,{source,rendered});if(current!==rendered)node.setAttribute(name,rendered);}}
    for(const child of node.childNodes||[])walk(child);
  }
  const config={subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','placeholder']};
  function observe(){observer?.observe(document.documentElement,config);}
  function refresh(){observer?.disconnect();walk(document.documentElement);if(document.documentElement)document.documentElement.lang=language==='en'?'en':'zh-CN';const button=document.getElementById('language-toggle');if(button)button.textContent=language==='en'?'中文':'English';observe();}
  function setLanguage(value){language=value==='en'?'en':'zh';try{storage?.setItem('twin-turbo-language',language);}catch{}onChange(language);refresh();}
  function init(){
    if(typeof MutationObserver!=='undefined'&&document.documentElement){observer=new MutationObserver(records=>{observer.disconnect();for(const record of records){if(record.type==='childList')for(const child of record.addedNodes)walk(child);else walk(record.target);}observe();});}
    for(const lang of ['zh','en'])document.getElementById('language-'+lang)?.addEventListener('click',()=>{setLanguage(lang);document.getElementById('language-dialog').close();});
    document.getElementById('language-toggle')?.addEventListener('click',()=>{document.getElementById('language-dialog').showModal();});
    document.getElementById('language-dialog')?.addEventListener('cancel',event=>event.preventDefault());
    onChange(language);refresh();document.getElementById('language-dialog')?.showModal();
  }
  return {init,refresh,setLanguage,t:text=>translateText(text,language),get language(){return language;}};
}
