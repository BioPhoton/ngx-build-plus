import { ExecutionTransformer } from "@angular-devkit/build-angular";
import { BuilderContext, BuilderOutput, BuilderOutputLike } from "@angular-devkit/architect";
import { WebpackLoggingCallback } from "@angular-devkit/build-webpack";
import { Observable, of, from, isObservable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Plugin, ConfigHookFn } from "../ext/hook";
import { loadHook } from "../ext/load-hook";
import { experimental, getSystemPath, normalize } from '@angular-devkit/core';
import * as webpack from 'webpack';
import * as path from 'path';
import * as webpackMerge from 'webpack-merge';


export interface Transforms {
  webpackConfiguration?: ExecutionTransformer<webpack.Configuration>;
 
}

export interface BuilderHandlerPlusFn<A> {
  (input: A, context: BuilderContext, transforms: Transforms): BuilderOutputLike;
}


export function runBuilderHandler(options: any, transforms: Transforms, context: BuilderContext, builderHandler: BuilderHandlerPlusFn<any>, configTransformerName = 'webpackConfiguration') {
  
  let plugin: Plugin | null = null;
  if (options.plugin) {
    plugin = loadHook<Plugin>(options.plugin);
  }

  setupConfigHook(transforms, options, context, plugin, configTransformerName);

  if (plugin && plugin.pre) {
    plugin.pre(options);
  }

  const result = asObservable(builderHandler(options, context, transforms));

  return result.pipe(tap(_ => {
    if (plugin && plugin.post) {
      plugin.post(options);
    }
  }));
}

function asObservable(result: BuilderOutputLike) {
  if (isObservable(result)) {
      return result;
  }
  if (result instanceof Promise) {
    return from(result);
  }
  return of(result);
}

function setupConfigHook(transforms: Transforms, options: any, context: BuilderContext, plugin: Plugin | null, configTransformerName = 'webpackConfiguration') {
  const originalConfigFn = transforms[configTransformerName];
  transforms[configTransformerName] = (config: webpack.Configuration) => {

    if (options.singleBundle) {
      if (!options.keepPolyfills && config.entry && config.entry['polyfills']) {
        delete config.entry['polyfills'];
      }
      if (config.optimization) {
        delete config.optimization.runtimeChunk;
        delete config.optimization.splitChunks;
      }
    }

    if (options.singleBundle && options.bundleStyles !== false && config.entry && config.entry['styles']) {
      delete config.entry['styles'];
    }

    if (options.extraWebpackConfig) {
      const filePath = path.resolve(getSystemPath(normalize(context.workspaceRoot)), options.extraWebpackConfig);
      const additionalConfig = require(filePath);
      config = webpackMerge([config, additionalConfig]);
    }
    if (plugin && plugin.config) {
      config = plugin.config(config);
    }

    if (options.configHook) {
        const hook = loadHook<ConfigHookFn>(options.configHook);
        config = hook(config);
    }

    if (originalConfigFn) {
      return originalConfigFn(config);
    }
    else {
      return config;
    }
  };
}
