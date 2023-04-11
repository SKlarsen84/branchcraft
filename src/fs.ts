import * as path from 'path'
import { promises as fs } from 'fs'
export async function applyCodeSuggestions(suggestions: any) {
  // Iterate through the suggestions and apply them to the corresponding files
  for (const fileSuggestion of suggestions) {
    const { filePath, fileContent } = fileSuggestion

    if (fileContent) {
      // Ensure the directory exists before writing the file
      const dirPath = path.dirname(filePath)
      await fs.mkdir(dirPath, { recursive: true })

      console.log(`Writing file ${filePath}`)
      await fs.writeFile(filePath, fileContent, 'utf-8')
    } else {
      console.error(`Error: No file content received for ${filePath}`)
    }
  }
}
