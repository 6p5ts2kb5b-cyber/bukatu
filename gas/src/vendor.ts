// React だけを先に読み込む（App1.html）。画面のプログラム（App2.html）はこれを使う
import * as React from "react";
import * as ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";
import * as JSX from "react/jsx-runtime";
(window as unknown as { __vendor: unknown }).__vendor = { React, ReactDOM, ReactDOMClient, JSX };
