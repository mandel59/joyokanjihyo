/**
Copyright 2021 Ryusei Yamaguchi

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as fs from "fs/promises"
import * as path from "path"
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.js"
import type { PDFDocumentProxy, TextItem } from "pdfjs-dist/types/src/display/api"

async function* pagesInRange(pageNumBegin: number, pageNumEnd: number, pdf: PDFDocumentProxy) {
  for (let pageNum = pageNumBegin; pageNum <= pageNumEnd; pageNum++) {
    const page = await pdf.getPage(pageNum)
    yield page
  }
}

interface TextSpan {
  page: number
  x: number
  y: number
  h: number
  str: string
  column: number
}

function getColumn(x: number) {
  if (x < 170) return 0
  if (170 <= x && x < 240) return 1
  if (240 <= x && x < 395) return 2
  return 3
}

async function extractJoyoKanjiHyoTextData(pdf: PDFDocumentProxy) {
  const lines: TextSpan[][] = []
  let currentLine!: TextSpan[]
  const nextEntry = () => {
    if (currentLine?.length && currentLine[0].str !== "漢　　字") {
      lines.push(currentLine)
    }
    currentLine = []
  }

  nextEntry()
  for await (const page of pagesInRange(11, 161, pdf)) {
    const textContent = await page.getTextContent()
    const textContentItems = textContent.items as TextItem[]
    let prevColumn = 0
    for (const text of textContentItems) {
      if (text.str === "本　　　表") {
        continue
      }
      if (/^\s*$/.test(text.str)) {
        continue
      }
      if (text.str.includes("－")) {
        nextEntry()
        continue
      }
      if (text.str.includes(".indd")) {
        nextEntry()
        continue
      }
      if (text.str.includes("2010/11/12")) {
        nextEntry()
        continue
      }
      if (text.transform[5] >= 820) {
        continue
      }
      const item = {
        page: page.pageNumber,
        x: text.transform[4],
        y: text.transform[5],
        h: text.height,
        str: text.str.trim(),
        column: getColumn(text.transform[4])
      }
      if (item.column < 2 && item.column < prevColumn) {
        nextEntry()
      }
      if (item.column === 1 && prevColumn === 1) {
        nextEntry()
      }
      if (item.column === 1 && item.str.includes("\t")) {
        const [reading, examples] = item.str.split("\t")
        // p. 17 汚らわしい
        item.str = reading.trim()
        currentLine.push(item)
        currentLine.push({ ...item, x: 240, str: examples.trim(), column: 2 })
        prevColumn = 2
        continue
      }
      prevColumn = item.column
      currentLine.push(item)
    }
  }
  nextEntry()
  return lines
}

function* formatJoyoKanji(lines: TextSpan[][]) {
  let prevSubjectField = ""
  for (const line of lines) {
    const firstField = line.filter(({ column }) => column === 0)
    const secondField = line.filter(({ column }) => column === 1)
    const thirdField = line.filter(({ column }) => column === 2)
    const fourthField = line.filter(({ column }) => column === 3)

    const page = line[0].page
    const subjectField = firstField.map(span => span.str).join("") || prevSubjectField

    let subject = String.fromCodePoint(subjectField.codePointAt(0) as number)
    let kangxi: string[] | null = subjectField.match(/（.）/gu)?.map(c => c.replace(/[（）]/gu, "")) || null
    let acceptable: string | null = subjectField.match(/［.］/gu)?.map(c => c.replace(/[［］]/gu, ""))?.[0] || null
    let reading = secondField.map(span => span.str).join("\n") || null
    const examples = thirdField.flatMap(span => span.str.split("，").filter(s => s !== ""))

    if (subjectField === "弁\t\t\t辨") {
      // p. 139 弁
      subject = "弁"
      kangxi = ["辨", "瓣", "辯"]
    } else if (subjectField === "餅［餅］" || subjectField === "（餠）\t もち") {
      // p. 138 餅
      subject = "餅"
      kangxi = ["餠"]
      acceptable = "餅"
      if (subjectField === "（餠）\t もち") {
        reading = "もち"
      }
    } else if (subjectField === "瓣辯便") {
      // p. 139 便
      subject = "便"
    } else if (subject === "亀") {
      // p. 33 亀
      kangxi = ["龜"]
    }

    const note = fourthField.map(span => span.str).join("")
    prevSubjectField = subjectField

    yield {
      page,
      subject,
      kangxi,
      acceptable,
      reading,
      examples,
      note,
    }
  }
}

async function main() {
  const file = await fs.readFile(path.join(__dirname, "joyokanjihyo_20101130.pdf"))
  const pdf = await pdfjs.getDocument(file).promise
  const textData = await extractJoyoKanjiHyoTextData(pdf)
  await fs.writeFile(path.join(__dirname, "joyokanjihyo.raw.json"), JSON.stringify(textData, null, 2), "utf-8")
  const joyoKanjiHyo = Array.from(formatJoyoKanji(textData))
  await fs.writeFile(path.join(__dirname, "joyokanjihyo.json"), JSON.stringify(joyoKanjiHyo, null, 2), "utf-8")
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
