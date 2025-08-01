'use strict'

/* PDFファイルのリストを保持 */
const files = []
/* 変換後の画像データURLを保持 */
const imagesCache = []

/* 要素の取得 */
const input = document.getElementById('file')
const drop = document.getElementById('drop')
const runBtn = document.getElementById('run')
const list = document.getElementById('list')
const preview = document.getElementById('preview')
const downloadBtn = document.getElementById('download')

/* ファイルをリストに追加する */
function addFiles(fileList) {
  for (const f of fileList) {
    if (f.type === 'application/pdf') {
      files.push(f)
      const li = document.createElement('li')
      li.textContent = f.name
      li.dataset.index = files.length - 1
      list.appendChild(li)
    }
  }
}

/* ドロップ操作 */
drop.addEventListener('dragover', e => {
  e.preventDefault()
})

drop.addEventListener('drop', e => {
  e.preventDefault()
  addFiles(e.dataTransfer.files)
})

/* ファイル選択 */
input.addEventListener('change', e => {
  addFiles(e.target.files)
})

/* PDFを画像化して表示 */
async function convertPdf(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const images = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const context = canvas.getContext('2d')
    await page.render({ canvasContext: context, viewport }).promise
    images.push(canvas.toDataURL('image/png'))
  }
  return images
}

/* 実行ボタン */
runBtn.addEventListener('click', async () => {
  preview.innerHTML = ''
  if (files.length === 0) return
  imagesCache.length = 0
  for (const file of files) {
    const images = await convertPdf(file)
    imagesCache.push(images)
  }
  showImages(0)
  downloadBtn.disabled = false
})

/* リスト項目をクリックしたとき */
list.addEventListener('click', e => {
  if (e.target.tagName === 'LI') {
    const index = Number(e.target.dataset.index)
    showImages(index)
  }
})

/* 画像をプレビューに表示 */
function showImages(index) {
  preview.innerHTML = ''
  for (const url of imagesCache[index] || []) {
    const img = document.createElement('img')
    img.src = url
    preview.appendChild(img)
  }
  downloadBtn.onclick = () => downloadZip()
}

/* 画像とPDFをZIPでダウンロード */
async function downloadZip() {
  const zip = new JSZip()
  for (let i = 0; i < files.length; i++) {
    const pdfFile = files[i]
    const folder = zip.folder(pdfFile.name.replace(/\.pdf$/i, ''))
    folder.file(pdfFile.name, pdfFile)
    const imgFolder = folder.folder('images')
    let page = 1
    for (const url of imagesCache[i]) {
      const blob = await fetch(url).then(res => res.blob())
      imgFolder.file(`page${page}.png`, blob)
      page++
    }
  }
  const content = await zip.generateAsync({ type: 'blob' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(content)
  a.download = 'all.zip'
  a.click()
  URL.revokeObjectURL(a.href)
}

/* Service Worker登録 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').then(registration => {
      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // 更新がある場合
              showUpdateMessage();
            }
          }
        };
      };
    });
  });
}

function showUpdateMessage() {
  const updateDiv = document.createElement('div');
  updateDiv.textContent = '更新データがあります。再読み込みしてください。';
  updateDiv.style.position = 'fixed';
  updateDiv.style.bottom = '20px';
  updateDiv.style.left = '50%';
  updateDiv.style.transform = 'translateX(-50%)';
  updateDiv.style.background = '#ff0';
  updateDiv.style.padding = '10px 20px';
  updateDiv.style.zIndex = '1000';
  updateDiv.style.borderRadius = '8px';

  const reloadBtn = document.createElement('button');
  reloadBtn.textContent = '更新';
  reloadBtn.onclick = () => {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage('SKIP_WAITING');
    }
    window.location.reload();
  };
  updateDiv.appendChild(reloadBtn);

  document.body.appendChild(updateDiv);
}
