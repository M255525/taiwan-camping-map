# CLAUDE.md — taiwan-camping-map（台灣露營地圖）

`taiwan-flower-map`（台灣賞花地圖）的姊妹專案（2026-11-12 建立，使用者：「以同樣概念，製作台灣露營地圖」）。3D 台灣（地形沿用賞鳥地圖），時間軸改成 **12 個月**：每個營地依「海拔＋各地月均溫＋季風／梅雨／颱風／午後雷陣雨」算露營指數 1～5，估算夜晚低溫、白天高溫、建議睡袋溫度與裝備。畫面是**森林遊樂區木牌＋牛皮紙＋等高線地形圖風**（不是花布或和紙）：陸地 shader 畫等高線（每 250 m，1,000 m 加粗），可疊「夜溫圖層」；可切白天／夜晚（星空、帳篷透光、營火搖曳＋點光源、螢火蟲季的營地有螢火蟲）。**不放營地照片**（授權難確認）。無框架、無建置。

## 資料（重要）
- `data.js`（`window.CM`）：`REGIONS / STATIONS / WXTYPES / WX / TYPES / SPOTS / ETIQUETTE / GLOSSARY / PEAKS / ISLANDS`。
- **營地 14 個**，以公營或觀光署合法露營場資料查得到的為主，2026-11 網搜查證：武陵（線上訂位、禁生柴）、福壽山（海拔 2,574 m 最高公營）、東勢林場（13:00 後紮營／11:00 前拔營、四月螢火蟲）、龍門、武荖坑（7–8 月戲水區）、鯉魚潭（15–18 報到）、小野柳（公有、雨棚＋棧板附停車）、澎湖湖西苗圃童軍營地、金門后湖（禁火、10:30 熄燈）。**惠蓀林場官網明文禁止露營，不可收錄；太魯閣合流 2024 地震後現況不明，未收**。石門營地、頭社水庫、走馬瀨、貓鼻頭、鹿野高台資訊較少，卡片寫「以官方公告為準」。
- 氣溫：8 個參考站月均溫是**概略值**（參考氣象署月平均），`CM.seaTemp` 反距離加權，`CM.LAPSE=.55`°C/100m；`CM.climate(p,m)` 是唯一入口（夜溫分數＋天氣扣分：ne/wd −2、my −1、ty −1、tn −0.5、貓鼻頭 10–3 月落山風 −1）。shader 的夜溫圖層用同一套公式（`uSt` uniform），改公式兩邊要一起改。
- 改資料後重產手冊：`node tools/build_manual.js . tools/manual_tpl.html`（**manual.html 是產出檔**，含 14×12 指數總表）。

## 程式
- **`scene.js` 是產出檔**：改 `tools/scene_tpl.js`，再跑 `python tools/build_scene.py ../taiwan-flower-map/scene.js`，會把賞花地圖 scene.js 的共用段落（幾何地形、標籤、營地排列、雲、鏡頭、點選）組進來；`TF` 在樣板裡是指向 `CM` 的別名。賞花地圖若改了這些段落的區段標題註解，切段會失敗。
- 營地群組放大 1.5 倍（`K`），近拍距離 2.6；營火點光源只照選中的營地（distance .4、強度 .5，太大會把地面照成一大片黃）。
- `app.js`：測試 hook `window.__camp`（`state/setMonth/selectSpot/selectRegion/setNight/setLayer/CM/scene`）。

## 配套
- ✅ 跑馬燈、manual（指數算法、總表、資料來源、完整創作者）、使用警語（底部＋首訪自動跳，`taiwanCampSeenWarning`）、⚙常用設定收合式（`taiwanCampSettings`；展開 `taiwanCampSetOpen`）、偏好 `taiwanCampPrefs`、PWA（改 js 記得 `CACHE_NAME` +1）、訪客計數器 `page_id=m255525.taiwancampingmap`、RWD（375px 無橫向捲動；手機月份軸只顯示數字）。
- ❌ 序號授權
- GitHub Pages：`master`＋`.github/workflows/deploy-pages.yml`，https://m255525.github.io/taiwan-camping-map/ （repo 由使用者自己 `gh repo create`，Pages 由 Claude 用 `gh api` 開啟後重跑 workflow）。

## Port／測試
- port **8870**（`.claude/launch.json` 的 `taiwan-camping-map`）。
- 驗證：`__camp.setMonth(4); setNight(true); selectSpot('dongshi')` 有螢火蟲（`scene.stats().fireflies>0`）、帳篷發光、營火；`setMonth(1)` 高山藍紫色、花東與南部綠色；`setMonth(7)` 推薦武陵；console 無錯誤；375px `scrollWidth===clientWidth`。
