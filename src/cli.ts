#!/usr/bin/env node

import axios from 'axios'
import inquirer from 'inquirer'

import simpleGit from 'simple-git'
import { config } from 'dotenv'
import { join } from 'path'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs/promises'
import * as readline from 'readline'

import { Configuration, OpenAIApi } from 'openai'
config()

const git = simpleGit()

async function isGitRepo() {
  try {
    await git.revparse(['--is-inside-work-tree'])
    return true
  } catch (error) {
    return false
  }
}

async function getRepoFiles() {
  const files = await git.raw(['ls-files'])
  return files.split('\n').filter(file => file.endsWith('.js') || file.endsWith('.ts'))
}

async function generateBranchCode(
  files: string[],
  apiKey: string,
  content: string,
  languages: string,
  specialInstructions: string
) {
  const fileContentsPromises = files.map(async file => {
    const content = await fs.readFile(file, 'utf-8')
    return { path: file, content }
  })

  const fileContents = await Promise.all(fileContentsPromises)

  const fileList = files.map(path => `- ${path}`).join('\n')

  const initialPrompt = `The user wants to create a new branch that introduces the following feature: "${content}". The current repository has the following existing files:

${fileList}

Return ONLY a comma separated list of file names that seem like they may be pertinent to this new branch. Do not write any other text in your response.
`

  // Initialize the history array
  const history: { role: string; content: string }[] = []

  //set the instructory prompt telling the GPT what role it is playing

  history.push({
    role: 'system',
    content:
      'You are a helpful AI that will assist the user in providing code suggestions for their project based on their request.'
  })

  //add any special instructions to the history
  if (specialInstructions) {
    history.push({
      role: 'user',
      content: 'here are special instructions to consider when fulfilling your work: ' + specialInstructions
    })
  }

  const fileRequest = await chatGptRequest(initialPrompt, apiKey, history)
  const requestedFiles = extractRequestedFiles(fileRequest)
  const sendingFilesPrompt = `I am now sending you the content of the requested files. Please inspect them. 
  I will let you know when I am done sending the file contents.`

  await chatGptRequest(sendingFilesPrompt, apiKey, history)
  for (const requestedFile of requestedFiles.filter(f => f !== 'src/cli.ts')) {
    const fileContent = fileContents.find(({ path }) => path === requestedFile)?.content
    const prompt = `File transmission start
    
    File name: ${requestedFile}
    File content:
    ${fileContent}
    
    File transmission end. Please reply OK.`

    console.log(`Sending file content for ${requestedFile}`)
    await chatGptRequest(prompt, apiKey, history)
  }

  console.log('All file contents sent. Awaiting code suggestions.')

  const codeSuggestionsPrompt = `You have received all the requested file contents. Please provide the code suggestions for adding functionality described here:

${content}

The code should be written in the following language(s): ${languages}.

The format of your reply must be this:

[
{
"filePath": "./file.ext",
"fileContent": "file content here"
},
...
]
The filePath (file name) should be indicative of the contents of the file.

I need this answer as a JSON string. Make sure it is valid JSON. Do NOT include any other text in your reply. Do NOT write things like "here's the suggested code" or "here's the code". Just provide the JSON string with the code suggestions.
`

  const codeSuggestionsText = await chatGptRequest(codeSuggestionsPrompt, apiKey, history)

  const codeSuggestions = parseCodeSuggestions(codeSuggestionsText)

  return codeSuggestions
}
// Updated chatGptRequest function
async function chatGptRequest(prompt: string, apiKey: string, history: { role: string; content: string }[]) {
  // Add the user's message to the history array
  history.push({
    role: 'user',
    content: prompt
  })

  const configuration = new Configuration({ apiKey })
  const openai = new OpenAIApi(configuration)

  const response = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo',
    messages: history as any
  })

  const text = ((response.data.choices[0].message as any).content as string).trim()

  // Add the AI's response to the history array
  history.push({
    role: 'assistant',
    content: text
  })

  // Save the entire chat history to a file in the user's home directory with the date and time as the file name
  const historyPath = `log.createthisbranch.latest.txt`
  await fs.writeFile(historyPath, JSON.stringify(history, null, 2), 'utf-8')

  // Replace double backslashes with single backslashes and remove extra quotes
  return text.replace(/\\/g, '\\').replace(/^"|"$/g, '')
}
function extractRequestedFiles(text: string) {
  const files = text.split(',').map(file => file.trim())

  return files
}

async function main() {
  console.log('Welcome to Create This Branch!')

  if (!(await isGitRepo())) {
    console.error('Error: The current directory is not a Git repository.')
    process.exit(1)
  }

  const apiKey = await getApiKey()

  const { content } = await inquirer.prompt([
    {
      type: 'input',
      name: 'content',
      message: 'What kind of content do you want your new branch to include?'
    }
  ])

  const { languages } = await inquirer.prompt([
    {
      type: 'input',
      name: 'languages',
      message: 'In what language(s) should the code be written? (comma separated)'
    }
  ])

  const { specialInstructions } = await inquirer.prompt([
    {
      type: 'input',
      name: 'specialInstructions',
      message:
        'Is there anything special you want GPT to know before generating the code suggestions? (Leave blank if not)'
    }
  ])

  const suggestedBranchName = `feature/${content.replace(/\s+/g, '-').toLowerCase()}`

  const { confirmed, branchName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'branchName',
      message: `Suggested branch name is "${suggestedBranchName}". Press Enter to accept or type a new name:`,
      default: suggestedBranchName
    },
    {
      type: 'confirm',
      name: 'confirmed',
      message: 'Do you want to create this new branch?',
      default: true
    }
  ])

  if (!confirmed) {
    console.log('Branch creation cancelled.')
    process.exit(0)
  }

  await git.checkoutLocalBranch(branchName)

  if (!apiKey) {
    console.error('Error: OPENAI_KEY not set. Please set it using "createthisbranch config set OPENAI_KEY=<your_key>".')
    process.exit(1)
  }

  const repoFiles = await getRepoFiles()
  const codeSuggestions = await generateBranchCode(repoFiles, apiKey, content, languages, specialInstructions)

  await applyCodeSuggestions(codeSuggestions)
}

async function applyCodeSuggestions(suggestions: any) {
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

async function getApiKey(): Promise<string> {
  const configPath = path.join(os.homedir(), '.createthisbranch')
  let apiKey: string

  try {
    apiKey = (await fs.readFile(configPath, 'utf-8')).trim()
  } catch (err) {
    console.log('No API key found. Please enter your OpenAI API key:')
    apiKey = await readLine()
    await saveApiKey(configPath, apiKey)
  }

  if (!apiKey) {
    console.log('API key not set. Please enter your OpenAI API key:')
    apiKey = await readLine()
    await saveApiKey(configPath, apiKey)
  }
  apiKey = apiKey.replace('OPENAI_KEY=', '')
  return apiKey
}

async function saveApiKey(configPath: string, apiKey: string) {
  await fs.writeFile(configPath, `OPENAI_KEY=${apiKey}`, 'utf-8')
  console.log('API key saved successfully.')
}

function readLine(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise(resolve => {
    rl.question('', answer => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function parseCodeSuggestions(text: string) {
  console.log('Code suggestions text:', text)

  const jsonText = extractJSONString(text)
  if (!jsonText) {
    console.error('Failed to extract JSON string from the response.')
    return null
  }

  // Custom function to safely parse JSON string
  const safelyParseJSON = (jsonString: string): any => {
    try {
      const parsed = JSON.parse(jsonString)
      if (parsed && typeof parsed === 'object') {
        return parsed
      }
    } catch (e) {
      console.error('Error parsing JSON:', e)
    }
    return null
  }

  // Parse the response
  const codeSuggestions = safelyParseJSON(jsonText)
  console.log('--------------------- GPT sent the following code suggestions back ---------------------')
  // Log the code suggestions one by one
  if (codeSuggestions) {
    for (const fileSuggestion of codeSuggestions) {
      console.log(fileSuggestion)
    }
  } else {
    console.error('Failed to parse code suggestions.')
  }

  console.log('----------------------------------------------------------------------------------------')
  return codeSuggestions
}

function extractJSONString(text: string): string | null {
  const jsonPattern = /(\{[\s\S]*\}|\[[\s\S]*\])/
  const match = text.match(jsonPattern)

  return match ? match[0] : null
}

main()
