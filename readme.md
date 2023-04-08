# BranchCraft

BranchCraft is an interactive CLI tool that streamlines branch creation and code suggestions for Git repositories. Powered by OpenAI's GPT-4, it enhances your development workflow by seamlessly generating new branches with relevant code snippets.

## Installation

To install BranchCraft globally and use it in your own Git repositories, run the following command:

```bash
npm install -g branchcraft
```

## Usage

### Configuration

Before using BranchCraft, you need to set your OpenAI API key. You can do this by running the following command:

```bash
branchcraft config set OPENAI_KEY=<your_key>
```

### Creating a new branch

To create a new branch using BranchCraft, navigate to your Git repository and run the following command:

```bash
branchcraft creaste
```

The CLI will prompt you for information about the new branch, such as the type of content it should include, the programming languages the code should be written in, and any special instructions for GPT. Once you provide the necessary information, BranchCraft will generate code suggestions and apply them to the new branch.
