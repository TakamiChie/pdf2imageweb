'use strict'

/* PDF.js本体と同じバージョンの文字描画用データを使用 */
const pdfJsBaseUrl = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/'
pdfjsLib.GlobalWorkerOptions.workerSrc = `${pdfJsBaseUrl}build/pdf.worker.min.js`

/* PDFファイルのリストを保持 */
const files = []
/* 変換後の画像データURLを保持 */
const imagesCache = []
/* 回転前の画像と各ページの回転角度を保持 */
const originalImagesCache = []
const pageRotations = []
let editingPages = false
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
  if (editingPages) return
  const firstNewIndex = files.length
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
  await editPages(0, async () => {
    for (let i = firstNewIndex; i < files.length; i += 1) {
      const images = await convertPdf(files[i])
      imagesCache[i] = images
      originalImagesCache[i] = [...images]
      pageRotations[i] = images.map(() => 0)
      pageOrders[i] = Array.from({ length: images.length }, (_, index) => index)
      mergeModes[i] = Array.from({ length: images.length }, () => 'none')
      mergedImagesCache[i] = Array.from({ length: images.length }, () => null)
    }
  })
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
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: `${pdfJsBaseUrl}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${pdfJsBaseUrl}standard_fonts/`,
    useSystemFonts: true
  }).promise
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
  if (editingPages) return
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
  if (images.length === 0) {
    const message = document.createElement('p')
    message.textContent = 'ページがありません。このPDFはダウンロード対象外です。'
    preview.appendChild(message)
  }
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
    const rotationControl = document.createElement('label')
    rotationControl.className = 'page-actions'
    rotationControl.textContent = '回転（時計回り）'
    const rotationSelect = document.createElement('select')
    rotationSelect.className = 'rotation-select'
    rotationSelect.setAttribute('aria-label', `ページ ${pageIndex + 1}の回転角度（時計回り）`)
    for (const angle of [0, 90, 180, 270]) {
      const option = document.createElement('option')
      option.value = angle
      option.textContent = `${angle}°`
      rotationSelect.appendChild(option)
    }
    rotationSelect.value = pageRotations[index][pageIndex]
    rotationSelect.addEventListener('change', () => {
      editPages(index, () => rotatePage(index, pageIndex, Number(rotationSelect.value)))
    })
    rotationControl.appendChild(rotationSelect)
    container.appendChild(rotationControl)
    const mergeControl = document.createElement('div')
    mergeControl.className = 'page-actions'
    const mergeType = document.createElement('select')
    mergeType.className = 'merge-select'
    mergeType.innerHTML = `
      <option value="" selected>--マージ方法選択--</option>
      <option value="vertical">2ページ上下マージ</option>
      <option value="horizontal">2ページ左右マージ</option>
      <option value="tripleVertical">3ページ上下マージ</option>
      <option value="tripleHorizontal">3ページ左右マージ</option>
      <option value="grid">4ページマージ</option>
    `
    mergeType.addEventListener('change', async () => {
      const selectedMode = mergeType.value
      if (!selectedMode) {
        return
      }
      if (isModeDisabled(modes, pageIndex, images.length, selectedMode)) {
        return
      }
      await editPages(index, () => applyMergeMode(modes, mergedImages, images, pageIndex, selectedMode))
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
    mergeControl.appendChild(mergeType)
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
    const deleteButton = document.createElement('button')
    deleteButton.type = 'button'
    deleteButton.textContent = '削除'
    deleteButton.setAttribute('aria-label', `ページ ${pageIndex + 1}を削除`)
    deleteButton.addEventListener('click', () => {
      deletePage(index, pageIndex)
    })
    actions.appendChild(deleteButton)
    container.appendChild(actions)
    preview.appendChild(container)
  })
  downloadBtn.onclick = () => downloadZip()
}

/* ページを削除し、そのページを含むマージを解除 */
async function deletePage(pdfIndex, pageIndex) {
  if (editingPages) return
  const images = imagesCache[pdfIndex]
  if (!images || !Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= images.length) return
  await editPages(pdfIndex, () => {
    const modes = mergeModes[pdfIndex]
    const mergedImages = mergedImagesCache[pdfIndex]
    for (let i = 0; i <= pageIndex; i += 1) {
      if (modes[i] !== 'none' && i + getRequiredPages(modes[i]) > pageIndex) {
        modes[i] = 'none'
        mergedImages[i] = null
      }
    }
    for (const cache of [imagesCache, originalImagesCache, pageRotations, pageOrders, mergeModes, mergedImagesCache]) {
      cache[pdfIndex].splice(pageIndex, 1)
    }
  })
}

/* ページの並びを入れ替える */
async function movePage(pdfIndex, pageIndex, offset) {
  if (editingPages) return
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
  for (const values of [originalImagesCache[pdfIndex], pageRotations[pdfIndex]]) {
    const value = values[pageIndex]
    values[pageIndex] = values[targetIndex]
    values[targetIndex] = value
  }
  await editPages(pdfIndex, () => refreshMergedImages(pdfIndex))
}

/* 編集中の操作を止め、完了後にプレビューを更新 */
async function editPages(pdfIndex, edit) {
  if (editingPages) return
  editingPages = true
  input.disabled = true
  downloadBtn.disabled = true
  preview.querySelectorAll('button, select').forEach(control => {
    control.disabled = true
  })
  try {
    await edit()
  } catch (error) {
    console.error(error)
    window.alert('ページの編集に失敗しました。もう一度お試しください。')
  } finally {
    editingPages = false
    input.disabled = false
    downloadBtn.disabled = !imagesCache.some(images => images.length > 0)
    showImages(pdfIndex)
  }
}

/* 元画像から指定角度の画像を生成し、マージ画像も更新 */
async function rotatePage(pdfIndex, pageIndex, angle) {
  if (![0, 90, 180, 270].includes(angle)) return
  const originalUrl = originalImagesCache[pdfIndex][pageIndex]
  let rotatedUrl = originalUrl
  if (angle !== 0) {
    const img = await loadImage(originalUrl)
    const canvas = document.createElement('canvas')
    const swapDimensions = angle === 90 || angle === 270
    canvas.width = swapDimensions ? img.height : img.width
    canvas.height = swapDimensions ? img.width : img.height
    const context = canvas.getContext('2d')
    context.translate(canvas.width / 2, canvas.height / 2)
    context.rotate(angle * Math.PI / 180)
    context.drawImage(img, -img.width / 2, -img.height / 2)
    rotatedUrl = canvas.toDataURL('image/png')
  }
  imagesCache[pdfIndex][pageIndex] = rotatedUrl
  pageRotations[pdfIndex][pageIndex] = angle
  await refreshMergedImages(pdfIndex)
}

/* 回転や並び替え後の画像でマージキャッシュを再生成 */
async function refreshMergedImages(pdfIndex) {
  const images = imagesCache[pdfIndex]
  const modes = mergeModes[pdfIndex]
  const mergedImages = mergedImagesCache[pdfIndex]
  mergedImages.fill(null)
  for (let i = 0; i < images.length; i += 1) {
    const mode = modes[i]
    if (mode === 'none' || i + getRequiredPages(mode) > images.length) continue
    const count = getRequiredPages(mode)
    mergedImages[i] = await mergeImages(
      images[i], images[i + 1], mode,
      count >= 3 ? images[i + 2] : undefined,
      count === 4 ? images[i + 3] : undefined
    )
  }
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
async function createMergedPdf(pdfFile, order, modes, images, mergedImages, rotations = []) {
  const arrayBuffer = await pdfFile.arrayBuffer()
  const sourcePdf = await PDFLib.PDFDocument.load(arrayBuffer)
  const outputPdf = await PDFLib.PDFDocument.create()
  for (let i = 0; i < order.length; i += 1) {
    const pageIndex = order[i]
    const mode = modes[i] || 'none'
    if (mode === 'none') {
      await appendOriginalPage(outputPdf, sourcePdf, pageIndex, rotations[i])
      continue
    }
    if (mode === 'grid') {
      const nextIndex = i + 3
      if (nextIndex >= order.length) {
        await appendOriginalPage(outputPdf, sourcePdf, pageIndex, rotations[i])
        continue
      }
      const mergedUrl = mergedImages && mergedImages[i]
        ? mergedImages[i]
        : await mergeImages(images[i], images[i + 1], mode, images[i + 2], images[i + 3])
      await appendImagePage(outputPdf, mergedUrl)
      i += 3
      continue
    }
    if (mode === 'tripleVertical' || mode === 'tripleHorizontal') {
      const nextIndex = i + 2
      if (nextIndex >= order.length) {
        await appendOriginalPage(outputPdf, sourcePdf, pageIndex, rotations[i])
        continue
      }
      const mergedUrl = mergedImages && mergedImages[i]
        ? mergedImages[i]
        : await mergeImages(images[i], images[i + 1], mode, images[i + 2])
      await appendImagePage(outputPdf, mergedUrl)
      i += 2
      continue
    }
    if (i + 1 >= order.length) {
      await appendOriginalPage(outputPdf, sourcePdf, pageIndex, rotations[i])
      continue
    }
    const mergedUrl = mergedImages && mergedImages[i]
      ? mergedImages[i]
      : await mergeImages(images[i], images[i + 1], mode)
    await appendImagePage(outputPdf, mergedUrl)
    i += 1
  }
  return outputPdf.save()
}

/* 元ページを回転情報ごとコピー */
async function appendOriginalPage(outputPdf, sourcePdf, pageIndex, rotation = 0) {
  const [copiedPage] = await outputPdf.copyPages(sourcePdf, [pageIndex])
  copiedPage.setRotation(PDFLib.degrees((copiedPage.getRotation().angle + rotation) % 360))
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
  if (editingPages || !imagesCache.some(images => images.length > 0)) return
  const zip = new JSZip()
  for (let i = 0; i < files.length; i++) {
    if (!pageOrders[i] || pageOrders[i].length === 0) continue
    const pdfFile = files[i]
    const folder = zip.folder(pdfFile.name.replace(/\.pdf$/i, ''))
    const reorderedPdfBytes = await createMergedPdf(
      pdfFile,
      pageOrders[i],
      mergeModes[i],
      imagesCache[i],
      mergedImagesCache[i],
      pageRotations[i]
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
    if (mode === 'none' || (mode !== 'grid' && mode !== 'tripleVertical' && mode !== 'tripleHorizontal' && !secondUrl)) {
      items.push({
        url: firstUrl,
        label: `ページ ${displayIndex}`
      })
      displayIndex += 1
      continue
    }
    if (mode === 'tripleVertical' || mode === 'tripleHorizontal') {
      const thirdUrl = images[i + 2]
      if (!thirdUrl) {
        items.push({
          url: firstUrl,
          label: `ページ ${displayIndex}`
        })
        displayIndex += 1
        continue
      }
      const mergedUrl = mergedImages && mergedImages[i]
        ? mergedImages[i]
        : await mergeImages(firstUrl, secondUrl, mode, thirdUrl)
      items.push({
        url: mergedUrl,
        label: `ページ ${displayIndex}-${displayIndex + 2}`
      })
      displayIndex += 3
      i += 2
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
  } else if (mode === 'tripleVertical' && thirdImage) {
    canvas.width = Math.max(firstImage.width, secondImage.width, thirdImage.width)
    canvas.height = firstImage.height + secondImage.height + thirdImage.height
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    const firstX = (canvas.width - firstImage.width) / 2
    const secondX = (canvas.width - secondImage.width) / 2
    const thirdX = (canvas.width - thirdImage.width) / 2
    context.drawImage(firstImage, firstX, 0)
    context.drawImage(secondImage, secondX, firstImage.height)
    context.drawImage(thirdImage, thirdX, firstImage.height + secondImage.height)
  } else if (mode === 'tripleHorizontal' && thirdImage) {
    canvas.width = firstImage.width + secondImage.width + thirdImage.width
    canvas.height = Math.max(firstImage.height, secondImage.height, thirdImage.height)
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    const firstY = (canvas.height - firstImage.height) / 2
    const secondY = (canvas.height - secondImage.height) / 2
    const thirdY = (canvas.height - thirdImage.height) / 2
    context.drawImage(firstImage, 0, firstY)
    context.drawImage(secondImage, firstImage.width, secondY)
    context.drawImage(thirdImage, firstImage.width + secondImage.width, thirdY)
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
  if (currentMode === 'tripleVertical') {
    return `ページ ${pageNumber}（次2ページと上下マージ）`
  }
  if (currentMode === 'tripleHorizontal') {
    return `ページ ${pageNumber}（次2ページと左右マージ）`
  }
  if (currentMode === 'grid') {
    return `ページ ${pageNumber}（4ページマージ）`
  }
  return `ページ ${pageNumber}`
}

/* マージ可否を判定 */
function isModeDisabled(modes, pageIndex, pageCount, mode) {
  const requiredPages = getRequiredPages(mode)
  if (pageIndex > pageCount - requiredPages) {
    return true
  }
  const previousMode = modes[pageIndex - 1]
  if (previousMode && previousMode !== 'none') {
    return true
  }
  return false
}

/* マージモードごとの必要ページ数を返す */
function getRequiredPages(mode) {
  if (mode === 'grid') {
    return 4
  }
  if (mode === 'tripleVertical' || mode === 'tripleHorizontal') {
    return 3
  }
  return 2
}

/* マージモードを適用 */
async function applyMergeMode(modes, mergedImages, images, pageIndex, mode) {
  const requiredPages = getRequiredPages(mode)
  const endIndex = pageIndex + requiredPages - 1
  if (!images[endIndex]) {
    return
  }
  if (mode === 'grid') {
    modes[pageIndex] = mode
    mergedImages[pageIndex] = await mergeImages(
      images[pageIndex],
      images[pageIndex + 1],
      mode,
      images[pageIndex + 2],
      images[pageIndex + 3]
    )
    for (let i = pageIndex + 1; i <= endIndex; i += 1) {
      if (i < modes.length) {
        modes[i] = 'none'
        mergedImages[i] = null
      }
    }
    return
  }
  if (mode === 'tripleVertical' || mode === 'tripleHorizontal') {
    modes[pageIndex] = mode
    mergedImages[pageIndex] = await mergeImages(
      images[pageIndex],
      images[pageIndex + 1],
      mode,
      images[pageIndex + 2]
    )
    for (let i = pageIndex + 1; i <= endIndex; i += 1) {
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
