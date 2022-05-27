'use strict'

import { update } from 'solc/abi'
import * as webworkify from 'webworkify-webpack'
import compilerInput, { compilerInputForConfigFile } from './compiler-input'
import EventManager from '../lib/eventManager'
import txHelper from './helper'
import {
  Source, SourceWithTarget, MessageFromWorker, CompilerState, CompilationResult,
  visitContractsCallbackParam, visitContractsCallbackInterface, CompilationError,
  gatherImportsCallbackInterface,
  isFunctionDescription
} from './types'

/*
  trigger compilationFinished, compilerLoaded, compilationStarted, compilationDuration
*/
export class Compiler {
  event
  state: CompilerState

  constructor (public handleImportCall?: (fileurl: string, cb) => void) {
    this.event = new EventManager()
    this.state = {
      compileJSON: null,
      worker: null,
      currentVersion: null,
      optimize: false,
      runs: 200,
      evmVersion: null,
      language: 'Solidity',
      compilationStartTime: null,
      target: null,
      useFileConfiguration: false,
      configFileContent: '',
      lastCompilationResult: {
        data: null,
        source: null
      }
    }

    this.event.register('compilationFinished', (success: boolean, data: CompilationResult, source: SourceWithTarget, input: string, version: string) => {
      if (success && this.state.compilationStartTime) {
        this.event.trigger('compilationDuration', [(new Date().getTime()) - this.state.compilationStartTime])
      }
      this.state.compilationStartTime = null
    })

    this.event.register('compilationStarted', () => {
      this.state.compilationStartTime = new Date().getTime()
    })
  }

  /**
   * @dev Setter function for CompilerState's properties (used by IDE)
   * @param key key
   * @param value value of key in CompilerState
   */

  set <K extends keyof CompilerState> (key: K, value: CompilerState[K]): void {
    this.state[key] = value
    if (key === 'runs') this.state['runs'] = parseInt(value)
  }

  /**
   * @dev Internal function to compile the contract after gathering imports
   * @param files source file
   * @param missingInputs missing import file path list
   */

  internalCompile (files: Source, missingInputs?: string[]): void {
    this.gatherImports(files, missingInputs, (error, input) => {
      if (error) {
        this.state.lastCompilationResult = null
        this.event.trigger('compilationFinished', [false, { error: { formattedMessage: error, severity: 'error' } }, files, input, this.state.currentVersion])
      } else if (this.state.compileJSON && input) { this.state.compileJSON(input) }
    })
  }

  /**
   * @dev Compile source files (used by IDE)
   * @param files source files
   * @param target target file name (This is passed as it is to IDE)
   */

  compile (files: Source, target: string): void {
    console.log('compiler', files, target)
    this.state.target = target
    this.event.trigger('compilationStarted', [])
    this.internalCompile(files)
  }

  /**
   * @dev Called when compiler is loaded, set current compiler version
   * @param version compiler version
   */

  onCompilerLoaded (version: string): void {
    this.state.currentVersion = version
    this.event.trigger('compilerLoaded', [version])
  }

  /**
   * @dev Called when compiler is loaded internally (without worker)
   */

  onInternalCompilerLoaded (): void {
    if (this.state.worker === null) {
      const compiler: any = typeof (window) !== 'undefined' && window['Module'] ? require('solc/wrapper')(window['Module']) : require('solc') // eslint-disable-line
      this.state.compileJSON = (source: SourceWithTarget) => {
        const missingInputs: string[] = []
        const missingInputsCallback = (path: string) => {
          missingInputs.push(path)
          return { error: 'Deferred import' }
        }
        let result: CompilationResult = {}
        let input = ""
        try {
          if (source && source.sources) {
            const { optimize, runs, evmVersion, language, useFileConfiguration, configFileContent } = this.state

            if (useFileConfiguration) {
              input = compilerInputForConfigFile(source.sources, JSON.parse(configFileContent))
            } else {
              input = compilerInput(source.sources, { optimize, runs, evmVersion, language })
            }

            result = JSON.parse(compiler.compile(input, { import: missingInputsCallback }))
          }
        } catch (exception) {
          result = { error: { formattedMessage: 'Uncaught JavaScript exception:\n' + exception, severity: 'error', mode: 'panic' } }
        }
        this.onCompilationFinished(result, missingInputs, source, input, this.state.currentVersion)
      }
      this.onCompilerLoaded(compiler.version())
    }
  }

  /**
   * @dev Called when compilation is finished
   * @param data compilation result data
   * @param missingInputs missing imports
   * @param source Source
   */

  onCompilationFinished (data: CompilationResult, missingInputs?: string[], source?: SourceWithTarget, input?: string, version?: string): void {
    let noFatalErrors = true // ie warnings are ok

    const checkIfFatalError = (error: CompilationError) => {
      // Ignore warnings and the 'Deferred import' error as those are generated by us as a workaround
      const isValidError = (error.message && error.message.includes('Deferred import')) ? false : error.severity !== 'warning'
      if (isValidError) noFatalErrors = false
    }
    if (data.error) checkIfFatalError(data.error)
    if (data.errors) data.errors.forEach((err) => checkIfFatalError(err))
    if (!noFatalErrors) {
      // There are fatal errors, abort here
      this.state.lastCompilationResult = null
      this.event.trigger('compilationFinished', [false, data, source, input, version])
    } else if (missingInputs !== undefined && missingInputs.length > 0 && source && source.sources) {
      // try compiling again with the new set of inputs
      this.internalCompile(source.sources, missingInputs)
    } else {
      data = this.updateInterface(data)
      if (source) {
        source.target = this.state.target
        this.state.lastCompilationResult = {
          data: data,
          source: source
        }
      }
      this.event.trigger('compilationFinished', [true, data, source, input, version])
    }
    this.event.trigger('astFinished', [true, data, source, input, version])
  }

  /**
   * @dev Load compiler using given version (used by remix-tests CLI)
   * @param version compiler version
   */

  loadRemoteVersion (version: string): void {
    console.log(`Loading remote solc version ${version} ...`)
    const compiler: any = require('solc') // eslint-disable-line
    compiler.loadRemoteVersion(version, (err, remoteCompiler) => {
      if (err) {
        console.error('Error in loading remote solc compiler: ', err)
      } else {
        this.state.compileJSON = (source: SourceWithTarget) => {
          const missingInputs: string[] = []
          const missingInputsCallback = (path: string) => {
            missingInputs.push(path)
            return { error: 'Deferred import' }
          }
          let result: CompilationResult = {}
          let input = ""
          try {
            if (source && source.sources) {
              const { optimize, runs, evmVersion, language, useFileConfiguration, configFileContent } = this.state

              if (useFileConfiguration) {
                input = compilerInputForConfigFile(source.sources, JSON.parse(configFileContent))
              } else {
                input = compilerInput(source.sources, { optimize, runs, evmVersion, language })
              }

              result = JSON.parse(remoteCompiler.compile(input, { import: missingInputsCallback }))
            }
          } catch (exception) {
            result = { error: { formattedMessage: 'Uncaught JavaScript exception:\n' + exception, severity: 'error', mode: 'panic' } }
          }
          this.onCompilationFinished(result, missingInputs, source, input, version)
        }
        this.onCompilerLoaded(version)
      }
    })
  }

  /**
   * @dev Load compiler using given URL (used by IDE)
   * @param usingWorker if true, load compiler using worker
   * @param url URL to load compiler from
   */

  loadVersion (usingWorker: boolean, url: string): void {
    console.log('Loading ' + url + ' ' + (usingWorker ? 'with worker' : 'without worker'))
    this.event.trigger('loadingCompiler', [url, usingWorker])
    if (this.state.worker) {
      this.state.worker.terminate()
      this.state.worker = null
    }
    if (usingWorker) {
      this.loadWorker(url)
    } else {
      this.loadInternal(url)
    }
  }

  /**
   * @dev Load compiler using 'script' element (without worker)
   * @param url URL to load compiler from
   */

  loadInternal (url: string): void {
    delete window['Module']
    // NOTE: workaround some browsers?
    window['Module'] = undefined
    // Set a safe fallback until the new one is loaded
    this.state.compileJSON = (source: SourceWithTarget) => {
      this.onCompilationFinished({ error: { formattedMessage: 'Compiler not yet loaded.' } })
    }
    const newScript: HTMLScriptElement = document.createElement('script')
    newScript.type = 'text/javascript'
    newScript.src = url
    document.getElementsByTagName('head')[0].appendChild(newScript)
    const check: number = window.setInterval(() => {
      if (!window['Module']) {
        return
      }
      window.clearInterval(check)
      this.onInternalCompilerLoaded()
    }, 200)
  }

  /**
   * @dev Load compiler using web worker
   * @param url URL to load compiler from
   */

  loadWorker (url: string): void {
    this.state.worker = webworkify(require.resolve('./compiler-worker'))
    const jobs: Record<'sources', SourceWithTarget> [] = []

    this.state.worker.addEventListener('message', (msg: Record <'data', MessageFromWorker>) => {
      const data: MessageFromWorker = msg.data
      switch (data.cmd) {
        case 'versionLoaded':
          if (data.data) this.onCompilerLoaded(data.data)
          break
        case 'compiled':
        {
          let result: CompilationResult
          if (data.data && data.job !== undefined && data.job >= 0) {
            try {
              result = JSON.parse(data.data)
            } catch (exception) {
              result = { error: { formattedMessage: 'Invalid JSON output from the compiler: ' + exception } }
            }
            let sources: SourceWithTarget = {}
            if (data.job in jobs !== undefined) {
              sources = jobs[data.job].sources
              delete jobs[data.job]
            }
            this.onCompilationFinished(result, data.missingInputs, sources, data.input, this.state.currentVersion)
          }
          break
        }
      }
    })

    this.state.worker.addEventListener('error', (msg: Record <'data', MessageFromWorker>) => {
      const formattedMessage = `Worker error: ${msg.data && msg.data !== undefined ? msg.data : msg['message']}`
      this.onCompilationFinished({ error: { formattedMessage } })
    })

    this.state.compileJSON = (source: SourceWithTarget) => {
      if (source && source.sources) {
        const { optimize, runs, evmVersion, language, useFileConfiguration, configFileContent } = this.state
        jobs.push({ sources: source })
        let input = ""

        try {
          if (useFileConfiguration) {
            input = compilerInputForConfigFile(source.sources, JSON.parse(configFileContent))
          } else {
            input = compilerInput(source.sources, { optimize, runs, evmVersion, language })
          }
        } catch (exception) {
          this.onCompilationFinished({ error: { formattedMessage: exception.message } }, [], source, "", this.state.currentVersion)
          return
        }


        this.state.worker.postMessage({
          cmd: 'compile',
          job: jobs.length - 1,
          input: input
        })
      }
    }

    this.state.worker.postMessage({
      cmd: 'loadVersion',
      data: url
    })
  }

  /**
   * @dev Gather imports for compilation
   * @param files file sources
   * @param importHints import file list
   * @param cb callback
   */

  gatherImports (files: Source, importHints?: string[], cb?: gatherImportsCallbackInterface): void {
    importHints = importHints || []
    // FIXME: This will only match imports if the file begins with one '.'
    // It should tokenize by lines and check each.
    const importRegex = /^\s*import\s*['"]([^'"]+)['"];/g
    for (const fileName in files) {
      let match: RegExpExecArray | null
      while ((match = importRegex.exec(files[fileName].content))) {
        let importFilePath = match[1]
        if (importFilePath.startsWith('./')) {
          const path: RegExpExecArray | null = /(.*\/).*/.exec(fileName)
          importFilePath = path ? importFilePath.replace('./', path[1]) : importFilePath.slice(2)
        }
        if (!importHints.includes(importFilePath)) importHints.push(importFilePath)
      }
    }
    while (importHints.length > 0) {
      const m: string = importHints.pop() as string
      if (m && m in files) continue

      if (this.handleImportCall) {
        this.handleImportCall(m, (err, content: string) => {
          if (err && cb) cb(err)
          else {
            files[m] = { content }
            this.gatherImports(files, importHints, cb)
          }
        })
      }
      return
    }
    if (cb) { cb(null, { sources: files }) }
  }

  /**
   * @dev Truncate version string
   * @param version version
   */

  truncateVersion (version: string): string {
    const tmp: RegExpExecArray | null = /^(\d+.\d+.\d+)/.exec(version)
    return tmp ? tmp[1] : version
  }

  /**
   * @dev Update ABI according to current compiler version
   * @param data Compilation result
   */

  updateInterface (data: CompilationResult) : CompilationResult {
    txHelper.visitContracts(data.contracts, (contract : visitContractsCallbackParam) => {
      if (!contract.object.abi) contract.object.abi = []
      if (this.state.language === 'Yul' && contract.object.abi.length === 0) {
        // yul compiler does not return any abi,
        // we default to accept the fallback function (which expect raw data as argument).
        contract.object.abi.push({
          payable: true,
          stateMutability: 'payable',
          type: 'fallback'
        })
      }
      if (data && data.contracts && this.state.currentVersion) {
        const version = this.truncateVersion(this.state.currentVersion)
        data.contracts[contract.file][contract.name].abi = update(version, contract.object.abi)
        // if "constant" , payable must not be true and stateMutability must be view.
        // see https://github.com/ethereum/solc-js/issues/500
        for (const item of data.contracts[contract.file][contract.name].abi) {
          if (isFunctionDescription(item) && item.constant) {
            item.payable = false
            item.stateMutability = 'view'
          }
        }
      }
    })
    return data
  }

  /**
   * @dev Get contract obj of the given contract name from last compilation result.
   * @param name contract name
   */

  getContract (name: string): Record<string, any> | null {
    if (this.state.lastCompilationResult && this.state.lastCompilationResult.data && this.state.lastCompilationResult.data.contracts) {
      return txHelper.getContract(name, this.state.lastCompilationResult.data.contracts)
    }
    return null
  }

  /**
   * @dev Call the given callback for all the contracts from last compilation result
   * @param cb callback
   */

  visitContracts (cb: visitContractsCallbackInterface) : void | null {
    if (this.state.lastCompilationResult && this.state.lastCompilationResult.data && this.state.lastCompilationResult.data.contracts) {
      return txHelper.visitContracts(this.state.lastCompilationResult.data.contracts, cb)
    }
    return null
  }

  /**
   * @dev Get the compiled contracts data from last compilation result
   */

  getContracts () : CompilationResult['contracts'] | null {
    if (this.state.lastCompilationResult && this.state.lastCompilationResult.data && this.state.lastCompilationResult.data.contracts) {
      return this.state.lastCompilationResult.data.contracts
    }
    return null
  }

  /**
   * @dev Get sources from last compilation result
   */

  getSources () : Source | null | undefined {
    if (this.state.lastCompilationResult && this.state.lastCompilationResult.source) {
      return this.state.lastCompilationResult.source.sources
    }
    return null
  }

  /**
   * @dev Get sources of passed file name from last compilation result
   * @param fileName file name
   */

  getSource (fileName: string) : Source['filename'] | null {
    if (this.state.lastCompilationResult && this.state.lastCompilationResult.source && this.state.lastCompilationResult.source.sources) {
      return this.state.lastCompilationResult.source.sources[fileName]
    }
    return null
  }

  /**
   * @dev Get source name at passed index from last compilation result
   * @param index    - index of the source
   */

  getSourceName (index: number): string | null {
    if (this.state.lastCompilationResult && this.state.lastCompilationResult.data && this.state.lastCompilationResult.data.sources) {
      return Object.keys(this.state.lastCompilationResult.data.sources)[index]
    }
    return null
  }
}
