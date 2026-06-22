---
layout: default
title: Notebook
permalink: /notebook/
nav_exclude: true
---

<div class="home">
  <h1 class="page-heading">Notebook</h1>


  {%- assign note_posts = site.categories.notes -%}
  {%- if note_posts and note_posts.size > 0 -%}
    <ul class="post-list">
      {%- for post in note_posts -%}
      <li>
        {%- assign date_format = site.minima.date_format | default: "%b %-d, %Y" -%}
        <span class="post-meta">{{ post.date | date: date_format }}</span>
        <h3>
          <a class="post-link" href="{{ post.url | relative_url }}">
            {{ post.title | escape }}
          </a>
        </h3>
      </li>
      {%- endfor -%}
    </ul>
  {%- else -%}
    <p>ยังไม่มีบันทึกในขณะนี้</p>
  {%- endif -%}
</div>
