import type { NextPage } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import React from 'react'

// 简单的内联组件
const AppComponent = () => (
  <div className="card">
    <h3>应用组件 &rarr;</h3>
    <p>这是简化后的App组件</p>
  </div>
)

const Home: NextPage = () => {
  return (
    <div className="container">
      <Head>
        <title>My Next.js App</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="main">
        <h1 className="title">
          Welcome to <a href="https://nextjs.org">Next.js!</a>
        </h1>

        <div className="grid">
          <Link href="/App/supabase-test" className="card">
            <h3>测试 Supabase (App Router) &rarr;</h3>
            <p>测试与Supabase数据库的连接 (App路由)</p>
          </Link>
          
          <Link href="/supabase-test" className="card">
            <h3>测试 Supabase (Pages Router) &rarr;</h3>
            <p>测试与Supabase数据库的连接 (Pages路由)</p>
          </Link>
          
          <AppComponent />
        </div>
      </main>
    </div>
  )
}

export default Home
