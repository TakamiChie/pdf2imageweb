'use strict'

/* PDFファイルのリストを保持 */
const files = []
/* 変換後の画像データURLを保持 */
const imagesCache = []
/* PDFページの並び順を保持 */
const pageOrders = []
/* ページマージ設定を保持 */
const mergeModes = []
/* マージ済み画像のキャッシュ */
const mergedImagesCache = []

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
  mergeModes.length = 0
  mergedImagesCache.length = 0
  for (const file of files) {
    const images = await convertPdf(file)
    imagesCache.push(images)
    pageOrders.push(Array.from({ length: images.length }, (_, index) => index))
    mergeModes.push(Array.from({ length: images.length }, () => 'none'))
    mergedImagesCache.push(Array.from({ length: images.length }, () => null))
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
async function showImages(index) {
  preview.innerHTML = ''
  const images = imagesCache[index] || []
  const modes = mergeModes[index] || []
  const mergedImages = mergedImagesCache[index] || []
  const listItems = Array.from(list.children)
  listItems.forEach((item, itemIndex) => {
    item.classList.toggle('active', itemIndex === index)
  })
  images.forEach((url, pageIndex) => {
    const container = document.createElement('div')
    container.className = 'page-item'
    const img = document.createElement('img')
    img.src = mergedImages[pageIndex] || url
    container.appendChild(img)
    const label = document.createElement('div')
    label.className = 'page-label'
    label.textContent = buildPageLabel(modes, pageIndex)
    container.appendChild(label)
    const mergeControl = document.createElement('div')
    mergeControl.className = 'page-actions'
    const mergeVertical = document.createElement('button')
    mergeVertical.type = 'button'
    mergeVertical.textContent = '上下でマージ'
    mergeVertical.disabled = isMergeDisabled(modes, pageIndex, images.length)
    mergeVertical.addEventListener('click', async () => {
      await applyMergeMode(modes, mergedImages, images, pageIndex, 'vertical')
      showImages(index)
    })
    const mergeHorizontal = document.createElement('button')
    mergeHorizontal.type = 'button'
    mergeHorizontal.textContent = '左右でマージ'
    mergeHorizontal.disabled = isMergeDisabled(modes, pageIndex, images.length)
    mergeHorizontal.addEventListener('click', async () => {
      await applyMergeMode(modes, mergedImages, images, pageIndex, 'horizontal')
      showImages(index)
    })
    const mergeGrid = document.createElement('button')
    mergeGrid.type = 'button'
    mergeGrid.textContent = '4ページマージ'
    mergeGrid.disabled = isFourMergeDisabled(modes, pageIndex, images.length)
    mergeGrid.addEventListener('click', async () => {
      await applyMergeMode(modes, mergedImages, images, pageIndex, 'grid')
      showImages(index)
    })
    const clearMerge = document.createElement('button')
    clearMerge.type = 'button'
    clearMerge.textContent = 'マージ解除'
    clearMerge.disabled = modes[pageIndex] === 'none'
    clearMerge.addEventListener('click', () => {
      modes[pageIndex] = 'none'
      mergedImages[pageIndex] = null
      showImages(index)
    })
    mergeControl.appendChild(mergeVertical)
    mergeControl.appendChild(mergeHorizontal)
    mergeControl.appendChild(mergeGrid)
    mergeControl.appendChild(clearMerge)
    container.appendChild(mergeControl)
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
  const modes = mergeModes[pdfIndex]
  const modeTemp = modes[pageIndex]
  modes[pageIndex] = modes[targetIndex]
  modes[targetIndex] = modeTemp
  const mergedImages = mergedImagesCache[pdfIndex]
  const mergedTemp = mergedImages[pageIndex]
  mergedImages[pageIndex] = mergedImages[targetIndex]
  mergedImages[targetIndex] = mergedTemp
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

/* PDFページをマージして生成 */
async function createMergedPdf(pdfFile, order, modes, images, mergedImages) {
  const arrayBuffer = await pdfFile.arrayBuffer()
  const sourcePdf = await PDFLib.PDFDocument.load(arrayBuffer)
  const outputPdf = await PDFLib.PDFDocument.create()
  for (let i = 0; i < order.length; i += 1) {
    const pageIndex = order[i]
    const mode = modes[i] || 'none'
    if (mode === 'none') {
      await appendOriginalPage(outputPdf, sourcePdf, pageIndex)
      continue
    }
    if (mode === 'grid') {
      const nextIndex = i + 3
      if (nextIndex >= order.length) {
        await appendOriginalPage(outputPdf, sourcePdf, pageIndex)
        continue
      }
      const mergedUrl = mergedImages && mergedImages[i]
        ? mergedImages[i]
        : await mergeImages(
          images[i],
          images[i + 1],
          mode,
          images[i + 2],
          images[i + 3]
        )
      await appendImagePage(outputPdf, mergedUrl)
      i += 3
      continue
    }
    if (i + 1 >= order.length) {
      await appendOriginalPage(outputPdf, sourcePdf, pageIndex)
      continue
    }
    if (mode === 'vertical') {
      const mergedUrl = mergedImages && mergedImages[i]
        ? mergedImages[i]
        : await mergeImages(images[i], images[i + 1], mode)
      await appendImagePage(outputPdf, mergedUrl)
    } else if (mode === 'horizontal') {
      const mergedUrl = mergedImages && mergedImages[i]
        ? mergedImages[i]
        : await mergeImages(images[i], images[i + 1], mode)
      await appendImagePage(outputPdf, mergedUrl)
    }
    i += 1
  }
  return outputPdf.save()
}

/* 元ページを回転情報ごとコピー */
async function appendOriginalPage(outputPdf, sourcePdf, pageIndex) {
  const [copiedPage] = await outputPdf.copyPages(sourcePdf, [pageIndex])
  outputPdf.addPage(copiedPage)
}

/* 画像をPDFページとして追加 */
async function appendImagePage(outputPdf, dataUrl) {
  const bytes = dataUrlToUint8Array(dataUrl)
  const embeddedImage = await outputPdf.embedPng(bytes)
  const { width, height } = embeddedImage
  const newPage = outputPdf.addPage([width, height])
  newPage.drawImage(embeddedImage, { x: 0, y: 0, width, height })
}

/* DataURLをUint8Arrayに変換 */
function dataUrlToUint8Array(dataUrl) {
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/* 画像とPDFをZIPでダウンロード */
async function downloadZip() {
  const zip = new JSZip()
  for (let i = 0; i < files.length; i++) {
    const pdfFile = files[i]
    const folder = zip.folder(pdfFile.name.replace(/\.pdf$/i, ''))
    const reorderedPdfBytes = await createMergedPdf(
      pdfFile,
      pageOrders[i],
      mergeModes[i],
      imagesCache[i],
      mergedImagesCache[i]
    )
    folder.file(pdfFile.name, reorderedPdfBytes)
    const imgFolder = folder.folder('images')
    const exportItems = await buildExportItems(imagesCache[i], mergeModes[i], mergedImagesCache[i])
    let page = 1
    for (const item of exportItems) {
      const blob = await fetch(item.url).then(res => res.blob())
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

/* マージ済みの出力用データを作成 */
async function buildExportItems(images, modes, mergedImages) {
  if (!modes || modes.every(mode => mode === 'none')) {
    return images.map((url, index) => ({
      url,
      label: `ページ ${index + 1}`
    }))
  }
  const items = []
  let displayIndex = 1
  for (let i = 0; i < images.length; i += 1) {
    const firstUrl = images[i]
    const secondUrl = images[i + 1]
    const mode = modes[i] || 'none'
    if (mode === 'none' || (mode !== 'grid' && !secondUrl)) {
      items.push({
        url: firstUrl,
        label: `ページ ${displayIndex}`
      })
      displayIndex += 1
      continue
    }
    if (mode === 'grid') {
      const thirdUrl = images[i + 2]
      const fourthUrl = images[i + 3]
      if (!thirdUrl || !fourthUrl) {
        items.push({
          url: firstUrl,
          label: `ページ ${displayIndex}`
        })
        displayIndex += 1
        continue
      }
      const mergedUrl = mergedImages && mergedImages[i]
        ? mergedImages[i]
        : await mergeImages(firstUrl, secondUrl, mode, thirdUrl, fourthUrl)
      items.push({
        url: mergedUrl,
        label: `ページ ${displayIndex}-${displayIndex + 3}`
      })
      displayIndex += 4
      i += 3
      continue
    }
    const mergedUrl = mergedImages && mergedImages[i]
      ? mergedImages[i]
      : await mergeImages(firstUrl, secondUrl, mode)
    items.push({
      url: mergedUrl,
      label: `ページ ${displayIndex}-${displayIndex + 1}`
    })
    displayIndex += 2
    i += 1
  }
  return items
}

/* 2ページを上下左右にマージ */
async function mergeImages(firstUrl, secondUrl, mode, thirdUrl, fourthUrl) {
  const images = [firstUrl, secondUrl, thirdUrl, fourthUrl].filter(Boolean)
  const loadedImages = await Promise.all(images.map(url => loadImage(url)))
  const [firstImage, secondImage, thirdImage, fourthImage] = loadedImages
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (mode === 'vertical') {
    canvas.width = Math.max(firstImage.width, secondImage.width)
    canvas.height = firstImage.height + secondImage.height
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    const firstX = (canvas.width - firstImage.width) / 2
    const secondX = (canvas.width - secondImage.width) / 2
    context.drawImage(firstImage, firstX, 0)
    context.drawImage(secondImage, secondX, firstImage.height)
  } else if (mode === 'horizontal') {
    canvas.width = firstImage.width + secondImage.width
    canvas.height = Math.max(firstImage.height, secondImage.height)
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    const firstY = (canvas.height - firstImage.height) / 2
    const secondY = (canvas.height - secondImage.height) / 2
    context.drawImage(firstImage, 0, firstY)
    context.drawImage(secondImage, firstImage.width, secondY)
  } else if (mode === 'grid' && thirdImage && fourthImage) {
    const leftWidth = Math.max(firstImage.width, thirdImage.width)
    const rightWidth = Math.max(secondImage.width, fourthImage.width)
    const topHeight = Math.max(firstImage.height, secondImage.height)
    const bottomHeight = Math.max(thirdImage.height, fourthImage.height)
    canvas.width = leftWidth + rightWidth
    canvas.height = topHeight + bottomHeight
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    const topLeftX = (leftWidth - firstImage.width) / 2
    const topRightX = leftWidth + (rightWidth - secondImage.width) / 2
    const bottomLeftX = (leftWidth - thirdImage.width) / 2
    const bottomRightX = leftWidth + (rightWidth - fourthImage.width) / 2
    const topLeftY = (topHeight - firstImage.height) / 2
    const topRightY = (topHeight - secondImage.height) / 2
    const bottomLeftY = topHeight + (bottomHeight - thirdImage.height) / 2
    const bottomRightY = topHeight + (bottomHeight - fourthImage.height) / 2
    context.drawImage(firstImage, topLeftX, topLeftY)
    context.drawImage(secondImage, topRightX, topRightY)
    context.drawImage(thirdImage, bottomLeftX, bottomLeftY)
    context.drawImage(fourthImage, bottomRightX, bottomRightY)
  }
  return canvas.toDataURL('image/png')
}

/* 画像の読み込み */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

/* ラベル文言を生成 */
function buildPageLabel(modes, pageIndex) {
  const pageNumber = pageIndex + 1
  const previousMode = modes[pageIndex - 1]
  if (previousMode && previousMode !== 'none') {
    return `ページ ${pageNumber}（前ページとマージ）`
  }
  const currentMode = modes[pageIndex]
  if (currentMode === 'vertical') {
    return `ページ ${pageNumber}（次ページと上下マージ）`
  }
  if (currentMode === 'horizontal') {
    return `ページ ${pageNumber}（次ページと左右マージ）`
  }
  if (currentMode === 'grid') {
    return `ページ ${pageNumber}（4ページマージ）`
  }
  return `ページ ${pageNumber}`
}

/* マージ可否を判定 */
function isMergeDisabled(modes, pageIndex, pageCount) {
  if (pageIndex >= pageCount - 1) {
    return true
  }
  const previousMode = modes[pageIndex - 1]
  if (previousMode && previousMode !== 'none') {
    return true
  }
  return false
}

/* 4ページマージ可否を判定 */
function isFourMergeDisabled(modes, pageIndex, pageCount) {
  if (pageIndex >= pageCount - 3) {
    return true
  }
  const previousMode = modes[pageIndex - 1]
  if (previousMode && previousMode !== 'none') {
    return true
  }
  return false
}

/* マージモードを適用 */
async function applyMergeMode(modes, mergedImages, images, pageIndex, mode) {
  if (mode === 'grid') {
    const nextIndex = pageIndex + 3
    if (!images[nextIndex]) {
      return
    }
    modes[pageIndex] = mode
    mergedImages[pageIndex] = await mergeImages(
      images[pageIndex],
      images[pageIndex + 1],
      mode,
      images[pageIndex + 2],
      images[pageIndex + 3]
    )
    for (let i = pageIndex + 1; i <= pageIndex + 3; i += 1) {
      if (i < modes.length) {
        modes[i] = 'none'
        mergedImages[i] = null
      }
    }
    return
  }
  const nextIndex = pageIndex + 1
  if (!images[nextIndex]) {
    return
  }
  modes[pageIndex] = mode
  mergedImages[pageIndex] = await mergeImages(images[pageIndex], images[nextIndex], mode)
  if (nextIndex < modes.length) {
    modes[nextIndex] = 'none'
    mergedImages[nextIndex] = null
  }
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
