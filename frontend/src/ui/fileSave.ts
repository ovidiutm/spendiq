export async function saveTextFileWithPrompt(options: {
  suggestedName: string
  contents: string
  mimeType?: string
}): Promise<void> {
  const { suggestedName, contents, mimeType = 'text/plain;charset=utf-8' } = options

  const picker = (window as any).showSaveFilePicker as undefined | ((opts: any) => Promise<any>)
  if (typeof picker === 'function') {
    const ext = suggestedName.includes('.') ? `.${suggestedName.split('.').pop()}` : '.txt'
    const handle = await picker({
      suggestedName,
      types: [
        {
          description: 'File',
          accept: { [mimeType.split(';')[0]]: [ext] },
        },
      ],
    })
    const writable = await handle.createWritable()
    await writable.write(contents)
    await writable.close()
    return
  }

  const blob = new Blob([contents], { type: mimeType })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = suggestedName
    a.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}
