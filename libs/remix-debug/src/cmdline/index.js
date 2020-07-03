const Web3 = require('web3')
const Debugger = require('../debugger/debugger.js')
const ContextManager = require('./contextManager.js')
import EventManager from 'events'
const remixLib = require('@remix-project/remix-lib')
const executionContext = remixLib.execution.executionContext

class CmdLine {

  constructor () {
    this.executionContext = executionContext
    this.events = new EventManager()
    this.lineColumnPos = null
    this.rawLocation = null
  }

  connect (providerType, url) {
    if (providerType !== 'http') throw new Error('unsupported provider type')
    this.web3 = new Web3(new Web3.providers.HttpProvider(url))
  }

  loadCompilationData (inputJson, outputJson) {
    const data = {}
    data.data = outputJson
    data.source = { sources: inputJson.sources }
    this.loadCompilationResult(data)
  }

  loadCompilationResult (compilationResult) {
    this.compilation = {}
    this.compilation.compilationResult = compilationResult
  }

  initDebugger (cb) {
    this.contextManager = new ContextManager(this.executionContext)

    this.debugger = new Debugger({
      web3: this.contextManager.getWeb3(),
      compilationResult: () => { return this.compilation.compilationResult }
    })

    this.contextManager.event.register('providerChanged', () => {
      this.debugger.updateWeb3(this.contextManager.getWeb3())
    })

    this.contextManager.initProviders()

    this.contextManager.addProvider('debugger_web3', this.web3)
    this.contextManager.switchProvider('debugger_web3', cb)
  }

  getSource () {
    const lineColumnPos = this.lineColumnPos

    if (!lineColumnPos || !lineColumnPos.start) return []

    const content = this.compilation.compilationResult.source.sources[this.filename].content.split('\n')

    const source = []

    let line
    line = content[lineColumnPos.start.line - 2]
    if (line !== undefined) {
      source.push('    ' + (lineColumnPos.start.line - 1) + ':  ' + line)
    }
    line = content[lineColumnPos.start.line - 1]
    if (line !== undefined) {
      source.push('    ' + lineColumnPos.start.line + ':  ' + line)
    }

    const currentLineNumber = lineColumnPos.start.line
    const currentLine = content[currentLineNumber]
    source.push('=>  ' + (currentLineNumber + 1) + ':  ' + currentLine)

    const startLine = lineColumnPos.start.line
    for (var i = 1; i < 4; i++) {
      const line = content[startLine + i]
      source.push('    ' + (startLine + i + 1) + ':  ' + line)
    }

    return source
  }

  getCurrentLine () {
    const lineColumnPos = this.lineColumnPos
    if (!lineColumnPos) return ''
    const currentLineNumber = lineColumnPos.start.line
    const content = this.compilation.compilationResult.source.sources[this.filename].content.split('\n')
    return content[currentLineNumber]
  }

  startDebug (txNumber, filename, cb) {
    this.filename = filename
    this.txHash = txNumber
    this.debugger.debug(null, txNumber, null, () => {
      this.debugger.event.register('newSourceLocation', (lineColumnPos, rawLocation) => {
        this.lineColumnPos = lineColumnPos
        this.rawLocation = rawLocation
        this.events.emit('source', [lineColumnPos, rawLocation])
      })

      this.debugger.vmDebuggerLogic.event.register('solidityState', (data) => {
        this.solidityState = data
        this.events.emit('globals', data)
      })

      // TODO: this doesnt work too well, it should request the data instead...
      this.debugger.vmDebuggerLogic.event.register('solidityLocals', (data) => {
        if (JSON.stringify(data) === '{}') return
        this.solidityLocals = data
        this.events.emit('locals', data)
      })

      if (cb) {
        // TODO: this should be an onReady event
        setTimeout(cb, 1000)
      }
    })
  }

  getVars () {
    return {
      locals: this.solidityLocals,
      contract: this.solidityState
    }
  }

  triggerSourceUpdate () {
    this.events.emit('source', [this.lineColumnPos, this.rawLocation])
  }

  stepJumpNextBreakpoint () {
    this.debugger.step_manager.jumpNextBreakpoint()
  }

  stepJumpPreviousBreakpoint () {
    this.debugger.step_manager.jumpPreviousBreakpoint()
  }

  stepOverForward (solidityMode) {
    this.debugger.step_manager.stepOverForward(solidityMode)
  }

  stepOverBack (solidityMode) {
    this.debugger.step_manager.stepOverBack(solidityMode)
  }

  stepIntoForward (solidityMode) {
    this.debugger.step_manager.stepIntoForward(solidityMode)
  }

  stepIntoBack (solidityMode) {
    this.debugger.step_manager.stepIntoBack(solidityMode)
  }

  jumpTo (step) {
    this.debugger.step_manager.jumpTo(step)
  }

  getTraceLength () {
    if (!this.debugger.step_manager) return 0
    return this.debugger.step_manager.traceLength
  }

  getCodeFirstStep () {
    if (!this.debugger.step_manager) return 0
    return this.debugger.step_manager.calculateFirstStep()
  }

  getCodeTraceLength () {
    if (!this.debugger.step_manager) return 0
    return this.debugger.step_manager.calculateCodeLength()
  }

  nextStep () {
    if (!this.debugger.step_manager) return 0
    return this.debugger.step_manager.nextStep()
  }

  previousStep () {
    if (!this.debugger.step_manager) return 0
    return this.debugger.step_manager.previousStep()
  }

  currentStep () {
    if (!this.debugger.step_manager) return 0
    return this.debugger.step_manager.currentStepIndex
  }

  canGoNext () {
    return this.currentStep() < this.getCodeTraceLength()
  }

  canGoPrevious () {
    return this.currentStep() > this.getCodeFirstStep()
  }

  unload () {
    return this.debugger.unload()
  }

  displayLocals () {
    console.dir('= displayLocals')
    console.dir(this.solidityLocals)
  }

  displayGlobals () {
    console.dir('= displayGlobals')
    console.dir(this.solidityState)
  }
}

module.exports = CmdLine
