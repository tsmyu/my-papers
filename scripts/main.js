// main.js
// 画面操作・LeaderLineでの線描画などのメインロジック

let mainPaperData = null;
let referenceDataList = [];   // 引用文献をユーザが絞り込むためのリスト
let finalPapersForGraph = []; // 最終的にグラフエリアに並べる {id, title, authors, year}

// LeaderLineで線を繋ぐために、DOM要素の参照を保持
const paperElements = {}; // key: id (DOIなど), value: HTMLElement

// 線を引く際に2つのノードを選ぶための一時保持
let selectedSourceId = null;
let selectedTargetId = null;

document.addEventListener('DOMContentLoaded', () => {
  const fetchBtn = document.getElementById('fetchBtn');
  const addToGraphBtn = document.getElementById('addToGraphBtn');
  const connectBtn = document.getElementById('connectBtn');

  fetchBtn.addEventListener('click', onFetchMetadata);
  addToGraphBtn.addEventListener('click', onAddToGraph);
  connectBtn.addEventListener('click', onConnectRelation);
});

/**
 * 1. Crossref APIからメタデータを取得 → 画面にメイン論文と引用文献リストを表示
 */
async function onFetchMetadata() {
  const doiInput = document.getElementById('doiInput');
  const doiValue = doiInput.value.trim();
  if (!doiValue) {
    alert('DOIを入力してください');
    return;
  }

  try {
    const data = await fetchCrossrefData(doiValue);
    mainPaperData = data;
    referenceDataList = data.references || [];
    renderMainPaper();
    renderReferenceList();
  } catch (err) {
    console.error(err);
    alert('メタデータ取得に失敗しました');
  }
}

/**
 * メイン論文を画面表示
 */
function renderMainPaper() {
  const area = document.getElementById('mainPaperArea');
  area.innerHTML = '';
  if (!mainPaperData) return;

  const div = document.createElement('div');
  div.className = 'paper-box';
  div.innerHTML = `
    <h3>${mainPaperData.title}</h3>
    <p>著者: ${mainPaperData.authors.join(', ')}</p>
    <p>出版年: ${mainPaperData.year}</p>
    <p>DOI: ${mainPaperData.doi}</p>
  `;
  area.appendChild(div);
}

/**
 * 引用文献リストを表示 （各文献に削除ボタン）
 */
function renderReferenceList() {
  const refList = document.getElementById('referenceList');
  refList.innerHTML = '';

  referenceDataList.forEach((ref, index) => {
    const div = document.createElement('div');
    div.className = 'ref-item';
    div.innerHTML = `
      <strong>${ref.title}</strong> 
      <span>(${ref.year})</span>
      <span>DOI: ${ref.doi || 'なし'}</span>
      <button class="removeBtn" data-index="${index}">削除</button>
    `;
    refList.appendChild(div);
  });

  // 削除ボタンにイベント付与
  const removeBtns = refList.querySelectorAll('.removeBtn');
  removeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.getAttribute('data-index'), 10);
      referenceDataList.splice(idx, 1); // 配列から削除
      renderReferenceList();
    });
  });
}

/**
 * 2. 「Add to Graph」ボタン押下時:
 *    メイン論文 + 残っている引用文献 をグラフ用のリストにまとめ、画面に表示
 */
function onAddToGraph() {
  finalPapersForGraph = [];

  // メイン論文を先頭に追加
  if (mainPaperData) {
    finalPapersForGraph.push({
      id: mainPaperData.doi || 'mainPaper',
      title: mainPaperData.title,
      authors: mainPaperData.authors,
      year: mainPaperData.year
    });
  }

  // 引用文献を続けて追加
  referenceDataList.forEach(ref => {
    // DOIが無い場合、仮IDを生成
    const refId = ref.doi ? ref.doi : 'ref-' + Math.random().toString(36).substr(2, 5);
    finalPapersForGraph.push({
      id: refId,
      title: ref.title || 'Untitled',
      authors: ref.authors || [],
      year: ref.year || 'N/A'
    });
  });

  // 年代でソート（昇順）
  finalPapersForGraph.sort((a, b) => {
    const ya = parseInt(a.year, 10) || 0;
    const yb = parseInt(b.year, 10) || 0;
    return ya - yb;
  });

  renderGraphArea();
}

/**
 * グラフエリアに論文を年代順に上から下へ並べる
 */
function renderGraphArea() {
  const graphArea = document.getElementById('graphArea');
  graphArea.innerHTML = '';
  paperElementsClear();

  finalPapersForGraph.forEach((paper, index) => {
    const box = document.createElement('div');
    box.className = 'paper-node';
    box.innerHTML = `
      <div class="paper-title">${paper.title}</div>
      <div class="paper-authors">${paper.authors.join(', ')}</div>
      <div class="paper-year">${paper.year}</div>
    `;
    // 縦方向に並べる: index * 150 px を仮に top にする
    box.style.top = `${index * 150}px`;
    // 横位置は固定で左寄せとする（自由にしたければドラッグ移動など実装）
    box.style.left = '50px';

    // データ属性でIDを持たせておく
    box.dataset.pid = paper.id;

    // クリックで「ソース/ターゲット」選択
    box.addEventListener('click', () => onPaperNodeClick(paper.id));

    graphArea.appendChild(box);
    paperElements[paper.id] = box;
  });
}

/**
 * 選択したノードを記録し、2つ揃えば線を引く準備
 */
function onPaperNodeClick(paperId) {
  // 1回目: source をセット
  if (!selectedSourceId) {
    selectedSourceId = paperId;
    highlightBox(paperId, true);
  } 
  // 2回目: target をセット
  else if (!selectedTargetId && paperId !== selectedSourceId) {
    selectedTargetId = paperId;
    highlightBox(paperId, true);
  }
  // 3回目: すでに2つ選択してる場合はいったんリセット
  else {
    resetSelection();
    selectedSourceId = paperId;
    highlightBox(paperId, true);
  }
}

/**
 * Connectボタン押下 → 選択中の2つのノードを線で結ぶ
 */
function onConnectRelation() {
  if (!selectedSourceId || !selectedTargetId) {
    alert('2つの論文を選択してください');
    return;
  }
  const desc = document.getElementById('relationDesc').value.trim();
  if (!desc) {
    alert('関係説明を入力してください');
    return;
  }

  // LeaderLineを描画
  const sourceEl = paperElements[selectedSourceId];
  const targetEl = paperElements[selectedTargetId];
  if (!sourceEl || !targetEl) {
    alert('要素が見つかりません');
    return;
  }

  // 線を引いてツールチップとして説明を表示
  const line = new LeaderLine(
    LeaderLine.pointAnchor(sourceEl, { x: '100%', y: '50%' }),
    LeaderLine.pointAnchor(targetEl, { x: 0, y: '50%' }),
    {
      color: 'rgba(0, 0, 255, 0.6)',
      endPlug: 'arrow1',
      startLabel: LeaderLine.pathLabel(desc, {
        startLabel: true,
        offset: 2
      })
    }
  );

  // 選択状態をリセット
  resetSelection();
  document.getElementById('relationDesc').value = '';
}

/** 選択ハイライトのON/OFF */
function highlightBox(paperId, isOn) {
  const el = paperElements[paperId];
  if (el) {
    el.style.border = isOn ? '2px solid red' : '1px solid #ccc';
  }
}

/** 選択を初期化 */
function resetSelection() {
  if (selectedSourceId) highlightBox(selectedSourceId, false);
  if (selectedTargetId) highlightBox(selectedTargetId, false);
  selectedSourceId = null;
  selectedTargetId = null;
}

/** 要素保持をクリア */
function paperElementsClear() {
  for (const k in paperElements) {
    delete paperElements[k];
  }
}
