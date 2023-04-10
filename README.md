# BranchCraft
BranchCraft is an interactive CLI tool that streamlines branch creation and code suggestions for Git repositories. Powered by OpenAI's GPT, it enhances your development workflow by seamlessly generating new branches with relevant code snippets.
With BranchCraft, you can quickly create new branches containing relevant code snippets, making it easier to jumpstart your development process.

## Installation
To install BranchCraft globally and use it in your own Git repositories, run the following command:

```
npm install -g branchcraft
```

### Configuration

The first time you use branchcraft, you will need to configure your OpenAI API key. You will be prompted for the key by the Cli.
Your API key can be found in your OpenAI account settings.

The key is stored by branchraft in your home directory in a file called `.branchcraft`. If you need to change your key, you can do so by editing this file.


### Creating a new branch

To create a new branch using BranchCraft, navigate to your Git repository and run the following command:

```
branchcraft
```

The CLI will prompt you for information about the new branch, such as the type of content it should include, the programming languages the code should be written in, and any special instructions for GPT. Once you provide the necessary information, BranchCraft will generate code suggestions and apply them to the new branch.


### Workflow example:
Here's an example of how you might use BranchCraft in your workflow:

First, install BranchCraft globally by running the following command in your terminal:

```
npm install -g branchcraft
```

Configure your OpenAI API key. When you run BranchCraft for the first time, it will prompt you for the key. You can find the key in your OpenAI account settings. The key will be stored in a .branchcraft file in your home directory.

Now, navigate to your existing Git repository:

```
cd /path/to/your/repository
```
Run the BranchCraft CLI tool:

```bash
branchcraft
```

The CLI will guide you through a series of prompts. 
Based on your input, BranchCraft will use GPT to generate relevant code suggestions for the new branch.

BranchCraft creates the new branch and applies the generated code suggestions
You can now review the generated code, make any necessary adjustments, and continue working on the new feature.
