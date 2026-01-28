'use strict'

/* PDFファイルのリストを保持 */
const files = []
/* 変換後の画像データURLを保持 */
const imagesCache = []
/* PDFページの並び順を保持 */
const pageOrders = []

/* 要素の取得 */
const input = document.getElementById('file')
const drop = document.getElementById('drop')
const list = document.getElementById('list')
const preview = document.getElementById('preview')
const downloadBtn = document.getElementById('download')

/* ファイルをリストに追加する */
async function addFiles(fileList) {
  for (const f of fileList) {
    if (f.type === 'application/pdf') {
      files.push(f)
      const li = document.createElement('li')
      li.textContent = f.name
      li.dataset.index = files.length - 1
      list.appendChild(li)
    }
  }

  preview.innerHTML = ''
  if (files.length === 0) return
  imagesCache.length = 0
  pageOrders.length = 0
  for (const file of files) {
    const images = await convertPdf(file)
    imagesCache.push(images)
    pageOrders.push(Array.from({ length: images.length }, (_, index) => index))
  }
  showImages(0)
  downloadBtn.disabled = false
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
  const images = imagesCache[index] || []
  const listItems = Array.from(list.children)
  listItems.forEach((item, itemIndex) => {
    item.classList.toggle('active', itemIndex === index)
  })
  images.forEach((url, pageIndex) => {
    const container = document.createElement('div')
    container.className = 'page-item'
    const img = document.createElement('img')
    img.src = url
    container.appendChild(img)
    const label = document.createElement('div')
    label.className = 'page-label'
    label.textContent = `ページ ${pageIndex + 1}`
    container.appendChild(label)
    const actions = document.createElement('div')
    actions.className = 'page-actions'
    const upButton = document.createElement('button')
    upButton.type = 'button'
    upButton.textContent = '上へ'
    upButton.disabled = pageIndex === 0
    upButton.addEventListener('click', () => {
      movePage(index, pageIndex, -1)
    })
    const downButton = document.createElement('button')
    downButton.type = 'button'
    downButton.textContent = '下へ'
    downButton.disabled = pageIndex === images.length - 1
    downButton.addEventListener('click', () => {
      movePage(index, pageIndex, 1)
    })
    actions.appendChild(upButton)
    actions.appendChild(downButton)
    container.appendChild(actions)
    preview.appendChild(container)
  })
  downloadBtn.onclick = () => downloadZip()
}

/* ページの並びを入れ替える */
function movePage(pdfIndex, pageIndex, offset) {
  const images = imagesCache[pdfIndex]
  const targetIndex = pageIndex + offset
  if (!images || targetIndex < 0 || targetIndex >= images.length) {
    return
  }
  const order = pageOrders[pdfIndex]
  const orderTemp = order[pageIndex]
  order[pageIndex] = order[targetIndex]
  order[targetIndex] = orderTemp
  const temp = images[pageIndex]
  images[pageIndex] = images[targetIndex]
  images[targetIndex] = temp
  showImages(pdfIndex)
}

/* PDFページの並び替え結果を生成 */
async function createReorderedPdf(pdfFile, order) {
  const arrayBuffer = await pdfFile.arrayBuffer()
  const sourcePdf = await PDFLib.PDFDocument.load(arrayBuffer)
  const outputPdf = await PDFLib.PDFDocument.create()
  const pages = await outputPdf.copyPages(sourcePdf, order)
  pages.forEach(page => outputPdf.addPage(page))
  return outputPdf.save()
}

/* 画像とPDFをZIPでダウンロード */
async function downloadZip() {
  const zip = new JSZip()
  for (let i = 0; i < files.length; i++) {
    const pdfFile = files[i]
    const folder = zip.folder(pdfFile.name.replace(/\.pdf$/i, ''))
    const reorderedPdfBytes = await createReorderedPdf(pdfFile, pageOrders[i])
    folder.file(pdfFile.name, reorderedPdfBytes)
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

    // 新しいService Workerがアクティブになったらページをリロードする
    let refreshing;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      window.location.reload();
      refreshing = true;
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
    // waiting状態のService Workerに更新を促す
    navigator.serviceWorker.getRegistration().then(registration => {
      if (registration && registration.waiting) {
        registration.waiting.postMessage('SKIP_WAITING');
      }
    });
  };
  updateDiv.appendChild(reloadBtn);

  document.body.appendChild(updateDiv);
}
