import inquirer from 'inquirer'
import path from 'path'
import * as os from 'os'
import { promises as fs } from 'fs'
import * as readline from 'readline'

export async function getConfigs(): Promise<{ apiKey: string; tokenLimit: number }> {
  const configPath = path.join(os.homedir(), '.branchcraft')
  let apiKey: string
  let tokenLimit: number | undefined = undefined

  try {
    const configContent = (await fs.readFile(configPath, 'utf-8')).trim()
    const configLines = configContent.split('\n')
    apiKey = configLines.find(line => line.startsWith('OPENAI_KEY='))?.replace('OPENAI_KEY=', '') as string
  } catch (err) {
    console.log('No API key found. Please enter your OpenAI API key:')
    apiKey = await readLine()
    await saveApiKey(configPath, apiKey)
  }

  try {
    const configContent = (await fs.readFile(configPath, 'utf-8')).trim()
    const configLines = configContent.split('\n')
    tokenLimit = Number(
      configLines.find(line => line.startsWith('TOKEN_LIMIT='))?.replace('TOKEN_LIMIT=', '')
    ) as number

    if (tokenLimit !== 2048 && tokenLimit !== 4096) {
      throw new Error('Invalid token limit')
    }
  } catch (err) {
    const { premiumSubscription } = await inquirer.prompt([
      {
        type: 'input',
        name: 'premiumSubscription',
        message:
          'Do you have a premium OpenAI subscription? (Affects the number of tokens you can use per request.) [yes/no]',
        default: 'yes'
      }
    ])

    tokenLimit = premiumSubscription === 'yes' ? 4096 : 2048
    await saveTokenLimit(configPath, tokenLimit)
  }

  // Return both apiKey and tokenLimit
  return { apiKey, tokenLimit }
}

export async function saveApiKey(configPath: string, apiKey: string) {
  const currentContent = await fs.readFile(configPath, 'utf-8').catch(() => '')
  await fs.writeFile(configPath, `OPENAI_KEY=${apiKey}\n${currentContent}`, 'utf-8')
  console.log('API key saved successfully.')
}

export async function saveTokenLimit(configPath: string, tokenLimit: number) {
  const currentContent = await fs.readFile(configPath, 'utf-8').catch(() => '')
  await fs.writeFile(configPath, `TOKEN_LIMIT=${tokenLimit}\n${currentContent}`, 'utf-8')
  console.log('Token limit saved successfully.')
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

