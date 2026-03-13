use criterion::{black_box, criterion_group, criterion_main, Criterion};

// A dummy benchmark for the routing since we can't easily download a whole PBF
// during CI testing without a large footprint. This verifies that criterion is set up
// correctly and we can run `cargo bench`.
fn route_benchmark(c: &mut Criterion) {
    c.bench_function("dummy_routing", |b| {
        b.iter(|| {
            // Simulate work
            let mut sum = 0;
            for i in 0..1000 {
                sum += black_box(i);
            }
            sum
        })
    });
}

criterion_group!(benches, route_benchmark);
criterion_main!(benches);
