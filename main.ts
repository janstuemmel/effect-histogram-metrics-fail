import { createServer } from 'node:http';
import { HttpServer } from '@effect/platform';
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import { RouteContext } from '@effect/platform/Http/Router';
import { Effect, Layer, Metric, pipe } from 'effect';
import { NodeSdk } from '@effect/opentelemetry';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

const timer1 = Metric.timer('my-namespace.requests-with-tags');
const timer2 = Metric.timer('my-namespace.requests-without-tags');

const NodeSdkLive = NodeSdk.layer(() => ({
  resource: {
    serviceName: 'test',
  },
  metricReader: new PeriodicExportingMetricReader({
    exportIntervalMillis: 1000,
    exporter: new OTLPMetricExporter({
      url: 'http://localhost:4318/v1/metrics',
    }),
  }),
}));

export const handlerDurationMiddlewareDoesTag = <T, D>(
  handler: HttpServer.router.Route.Handler<T, D>,
) => Effect.flatMap(RouteContext, (ctx) => handler.pipe(
  Metric.trackDuration(timer1.pipe(
    Metric.tagged('method', ctx.route.method),
  ))
));

export const handlerDurationMiddlewareDoesNotTag = <T, D>(
  handler: HttpServer.router.Route.Handler<T, D>,
) => Effect.flatMap(RouteContext, (ctx) => handler.pipe(
  Metric.trackDuration(timer2),
  Effect.tagMetrics('method', ctx.route.method),
));

const app = HttpServer.router.empty.pipe(
  HttpServer.router.get('/', HttpServer.response.text('Hello world!')),
  // HttpServer.router.use(handlerDurationMiddlewareDoesTag),
  HttpServer.router.use(handlerDurationMiddlewareDoesNotTag),
);

const HttpServerLive = NodeHttpServer.server.layer(createServer, {
  port: 3000,
});

const AppLive = HttpServer.server
  .serve(app)
  .pipe(Layer.provide(HttpServerLive), Layer.provide(NodeSdkLive));

pipe(Layer.launch(AppLive), NodeRuntime.runMain);
